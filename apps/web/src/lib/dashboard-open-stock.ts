/** `window` CustomEvent: `detail: { code: string }` — 대시보드에서 해당 종목코드로 차트 열기 */
export const DASHBOARD_OPEN_STOCK_CHART = "stock-monitoring:dashboardOpenStockChart";

/** 홈 `/?code=` 딥링크(알림이 다른 페이지에서 열릴 때) */
export const DASHBOARD_STOCK_CODE_QUERY = "code";

export type DashboardOpenStockChartDetail = { code: string };
