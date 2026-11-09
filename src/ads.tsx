// Android-specific implementation is selected by Metro for native Android builds.
export const BANNER_HEIGHT = 0;
export function useAds(_enabled: boolean) {
  return {
    canShowBanner: false,
    busy: false,
    privacyRequired: false,
    showPrivacyOptions: async () => {},
    showWinInterstitial: async () => {},
  };
}
export function BannerAdSlot(_props: {
  enabled: boolean;
  background: string;
  border: string;
}) {
  return null;
}
