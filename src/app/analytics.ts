const measurementId = "G-PSWQEK5NSZ";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: (...args: unknown[]) => void;
};

export function initializeAnalytics() {
  if (
    !import.meta.env.PROD ||
    window.location.hostname !== "www.psnote.bzenky.dev"
  ) {
    return;
  }

  const analyticsWindow = window as AnalyticsWindow;
  if (analyticsWindow.gtag) return;
  const dataLayer = (analyticsWindow.dataLayer ??= []);
  analyticsWindow.gtag = (...args: unknown[]) => {
    dataLayer.push(args);
  };
  analyticsWindow.gtag("js", new Date());
  analyticsWindow.gtag("config", measurementId);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);
}
