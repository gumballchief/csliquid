use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::{
    errors::FuturesError,
    math::*,
    oracle::get_price,
    state::{LiquidityPool, Market, Position, PriceFeed, UserAccount, Vault},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OpenPositionParams {
    pub is_long:         bool,
    pub collateral:      u64,
    pub leverage:        u8,
    pub max_entry_price: u64,
}

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Seeds: [b"user_account", owner]
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + UserAccount::INIT_SPACE,
        seeds = [b"user_account", owner.key().as_ref()],
        bump,
    )]
    pub user_account: Box<Account<'info, UserAccount>>,

    /// Owner's USDC ATA — source of collateral + taker fee.
    #[account(
        mut,
        associated_token::mint      = usdc_mint,
        associated_token::authority = owner,
    )]
    pub user_usdc_account: Box<Account<'info, TokenAccount>>,

    /// Seeds: [b"market", market.price_feed]
    #[account(
        mut,
        seeds = [b"market", market.price_feed.as_ref()],
        bump  = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    /// New position PDA — one per (owner, market) pair.
    /// Seeds: [b"position", owner, market]
    #[account(
        init,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", owner.key().as_ref(), market.key().as_ref()],
        bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Protocol USDC SPL vault (initialized once by initialize_vault).
    /// Seeds: [b"vault", usdc_mint]
    #[account(
        mut,
        seeds = [b"vault", usdc_mint.key().as_ref()],
        bump,
    )]
    pub vault_token: Box<Account<'info, TokenAccount>>,

    /// Protocol liquidity data account.
    /// Seeds: [b"vault"]
    #[account(
        mut,
        seeds = [b"vault"],
        bump  = vault_data.bump,
    )]
    pub vault_data: Box<Account<'info, Vault>>,

    /// Protocol PriceFeed for this market.
    #[account(
        constraint = price_feed.key() == market.price_feed @ FuturesError::InvalidPrice
    )]
    pub price_feed: Box<Account<'info, PriceFeed>>,

    /// Global liquidity pool — credited with the taker fee.
    /// Seeds: [b"liquidity_pool"]
    #[account(
        mut,
        seeds = [b"liquidity_pool"],
        bump  = liquidity_pool.bump,
    )]
    pub liquidity_pool: Box<Account<'info, LiquidityPool>>,

    pub usdc_mint:                Box<Account<'info, Mint>>,
    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

pub fn handler(ctx: Context<OpenPosition>, params: OpenPositionParams) -> Result<()> {
    let OpenPositionParams { is_long, collateral, leverage, max_entry_price } = params;
    let clock = Clock::get()?;

    require!(collateral > 0, FuturesError::InvalidCollateral);
    require!(leverage >= 1 && leverage <= 20, FuturesError::InvalidLeverage);

    let entry_price = get_price(&ctx.accounts.price_feed, &clock)?;
    require!(entry_price <= max_entry_price, FuturesError::PriceSlippage);

    let notional = (collateral as u128)
        .checked_mul(leverage as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))? as u64;
    let size              = calc_size(notional, entry_price)?;
    let taker_fee         = calc_taker_fee(notional)?;
    let liquidation_price = calc_liquidation_price(is_long, entry_price, leverage)?;
    let total_cost        = collateral
        .checked_add(taker_fee)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.user_usdc_account.to_account_info(),
                to:        ctx.accounts.vault_token.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        total_cost,
    )?;

    let ua = &mut ctx.accounts.user_account;
    if ua.owner == Pubkey::default() {
        ua.owner = ctx.accounts.owner.key();
        ua.bump  = ctx.bumps.user_account;
    }
    let position_key = ctx.accounts.position.key();
    ua.positions.push(position_key);

    ctx.accounts.vault_data.total_liquidity = ctx.accounts.vault_data.total_liquidity
        .checked_add(total_cost)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;

    let market = &mut ctx.accounts.market;
    if is_long {
        market.total_long_open_interest = market.total_long_open_interest
            .checked_add(notional)
            .ok_or_else(|| error!(FuturesError::MathOverflow))?;
    } else {
        market.total_short_open_interest = market.total_short_open_interest
            .checked_add(notional)
            .ok_or_else(|| error!(FuturesError::MathOverflow))?;
    }
    let cumulative_funding_at_open = market.cumulative_funding;

    let position = &mut ctx.accounts.position;
    position.owner               = ctx.accounts.owner.key();
    position.market              = market.key();
    position.is_long             = is_long;
    position.collateral          = collateral;
    position.size                = size;
    position.notional            = notional;
    position.entry_price         = entry_price;
    position.liquidation_price   = liquidation_price;
    position.opened_at           = clock.unix_timestamp;
    position.entry_funding_index = cumulative_funding_at_open;
    position.bump                = ctx.bumps.position;

    let pool = &mut ctx.accounts.liquidity_pool;
    pool.total_usdc = pool.total_usdc
        .checked_add(taker_fee)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;
    pool.fees_earned = pool.fees_earned
        .checked_add(taker_fee)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;

    msg!(
        "{} {} units @ {} | collateral={} fee={} liq={}",
        if is_long { "LONG" } else { "SHORT" },
        size, entry_price, collateral, taker_fee, liquidation_price,
    );
    Ok(())
}
