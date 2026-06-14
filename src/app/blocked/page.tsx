export const metadata = {
  title: 'Service Unavailable — CSLIQUID',
};

export default function BlockedPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-red-900/40 border border-red-700 flex items-center justify-center mx-auto">
          <svg
            className="w-8 h-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Not Available in Your Region</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            CSLIQUID is not available in your jurisdiction. Due to local regulatory
            requirements, access to this platform is restricted in certain countries,
            including the Netherlands and Belgium.
          </p>
        </div>

        <div className="rounded-lg bg-gray-900 border border-gray-700 px-4 py-3 text-left text-sm text-gray-400 space-y-1">
          <p className="font-medium text-gray-300">If you believe this is a mistake:</p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-500">
            <li>Ensure you are not using a VPN or proxy</li>
            <li>Try again from your actual location</li>
            <li>Contact support if the issue persists</li>
          </ul>
        </div>

        <p className="text-xs text-gray-600">
          Access is determined by your IP geolocation and may not always be accurate.
        </p>
      </div>
    </div>
  );
}
