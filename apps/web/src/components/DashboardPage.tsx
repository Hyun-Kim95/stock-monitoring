"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiGet, apiSend } from "@/lib/api-client";
import {
  DASHBOARD_OPEN_STOCK_CHART,
  DASHBOARD_STOCK_CODE_QUERY,
  type DashboardOpenStockChartDetail,
} from "@/lib/dashboard-open-stock";
import { formatQuotePrice } from "@/lib/format-quote";
import {
  CHANGE_RATE_ALERT_THRESHOLDS,
  parseChangeRateAlertThreshold,
  useChangeRateAlerts,
  type ChangeRateAlertThresholdPct,
} from "@/hooks/useChangeRateAlerts";
import { useQuotesWebSocket } from "@/hooks/useQuotesWebSocket";
import { useDashboardOnboarding } from "@/hooks/useDashboardOnboarding";
import { DashboardOnboardingTour } from "@/components/DashboardOnboardingTour";
import { PriceChartPanel } from "@/components/PriceChartPanel";
import { ThemeToggle } from "@/components/ThemeToggle";

type ThemeBrief = { id: string; name: string };

type StockApi = {
  id: string;
  code: string;
  name: string;
  market: string | null;
  industryMajorCode: string | null;
  industryMajorName: string | null;
  /** KIS 기준 넥스트(NXT) 시세 조회 가능. null은 아직 판별 전(모의시세는 항상 null) */
  nxEligible: boolean | null;
  themes: ThemeBrief[];
};

type NewsItem = {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
};

type StockSearchItem = {
  code: string;
  name: string;
  market: string | null;
  themeNames: string[];
  industryMajorCode: string | null;
  industryMajorName: string | null;
};

type SortKey = "name" | "price" | "changeRate" | "volume" | "foreignNetBuyVolume" | "foreignOwnershipPct";
type SortDirection = "asc" | "desc";
type ColumnKey = "pin" | "name" | "market" | "nxt" | "price" | "changeRate" | "volume" | "foreignNetBuyVolume" | "foreignOwnershipPct" | "session";

const PINNED_STOCK_IDS_KEY = "dashboard.pinnedStockIds";
const DASHBOARD_BASIC_FILTERS_KEY = "dashboard.basicFilters";
const WATCHLIST_VISIBLE_COLUMNS_KEY = "dashboard.watchlistVisibleColumns";
const MOBILE_BREAKPOINT_MAX = 979;
const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = [
  "pin",
  "name",
  "market",
  "nxt",
  "price",
  "changeRate",
  "volume",
  "foreignNetBuyVolume",
  "foreignOwnershipPct",
  "session",
];
const COLUMN_OPTIONS: Array<{ key: ColumnKey; label: string }> = [
  { key: "pin", label: "고정" },
  { key: "name", label: "종목" },
  { key: "market", label: "시장" },
  { key: "nxt", label: "NXT" },
  { key: "price", label: "현재가" },
  { key: "changeRate", label: "등락률" },
  { key: "volume", label: "거래량" },
  { key: "foreignNetBuyVolume", label: "외인순매수" },
  { key: "foreignOwnershipPct", label: "외인%" },
  { key: "session", label: "세션" },
];

type DashboardBasicFilters = {
  filterText: string;
  marketFilter: string;
  sessionFilter: string;
  nxtFilter: string;
  themeFilterIds: string[];
};

type DashboardPreferenceApi = {
  pinnedStockIds: string[];
  filterText: string;
  marketFilter: string;
  sessionFilter: string;
  nxtFilter: string;
  themeFilterIds: string[];
  changeAlertThreshold: number | null;
};

function readPinnedStockIdsFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PINNED_STOCK_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writePinnedStockIdsToStorage(ids: string[]) {
  try {
    localStorage.setItem(PINNED_STOCK_IDS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function readDashboardBasicFiltersFromStorage(): DashboardBasicFilters | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DASHBOARD_BASIC_FILTERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Record<string, unknown>;
    return {
      filterText: typeof p.filterText === "string" ? p.filterText : "",
      marketFilter: typeof p.marketFilter === "string" ? p.marketFilter : "ALL",
      sessionFilter: typeof p.sessionFilter === "string" ? p.sessionFilter : "ALL",
      nxtFilter: typeof p.nxtFilter === "string" ? p.nxtFilter : "ALL",
      themeFilterIds: Array.isArray(p.themeFilterIds)
        ? p.themeFilterIds.filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return null;
  }
}

function readVisibleColumnsFromStorage(): ColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_COLUMNS;
  try {
    const raw = localStorage.getItem(WATCHLIST_VISIBLE_COLUMNS_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_COLUMNS;
    const allowed = new Set<ColumnKey>(DEFAULT_VISIBLE_COLUMNS);
    const filtered = parsed.filter((x): x is ColumnKey => typeof x === "string" && allowed.has(x as ColumnKey));
    return filtered.length > 0 ? filtered : DEFAULT_VISIBLE_COLUMNS;
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
}

function writeVisibleColumnsToStorage(cols: ColumnKey[]) {
  try {
    localStorage.setItem(WATCHLIST_VISIBLE_COLUMNS_KEY, JSON.stringify(cols));
  } catch {
    /* ignore */
  }
}

function formatForeignNetVol(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString("ko-KR")}`;
}

function formatForeignPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(3)}%`;
}

function addStockSearchErrorMessage(ex: unknown): string {
  if (ex instanceof ApiError) {
    const b = ex.body as { error?: { message?: string } } | undefined;
    return b?.error?.message ?? `검색 실패 (${ex.status})`;
  }
  return "검색에 실패했습니다.";
}

function addStockRegisterErrorMessage(ex: unknown): string {
  if (ex instanceof ApiError) {
    if (ex.status === 401) {
      return "관리자 토큰이 필요합니다. NEXT_PUBLIC_ADMIN_TOKEN을 설정하거나 관리자(종목 관리)에서 등록하세요.";
    }
    const b = ex.body as { error?: { code?: string; message?: string } } | undefined;
    if (b?.error?.code === "DUPLICATE") return "이미 등록된 종목코드입니다.";
    if (b?.error?.code === "STOCK_LIMIT") return b.error.message ?? "활성 종목 상한을 초과했습니다.";
    return b?.error?.message ?? `요청 실패 (${ex.status})`;
  }
  return "등록에 실패했습니다.";
}

export function DashboardPage() {
  const { quotes, connected, statusMsg } = useQuotesWebSocket();
  const [stocks, setStocks] = useState<StockApi[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 비어 있으면 테마 필터 없음. 값이 있으면 해당 테마 중 하나라도 있는 종목만 표시(OR). */
  const [themeFilterIds, setThemeFilterIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey | null>("changeRate");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [filterText, setFilterText] = useState("");
  const [marketFilter, setMarketFilter] = useState("ALL");
  const [sessionFilter, setSessionFilter] = useState("ALL");
  const [nxtFilter, setNxtFilter] = useState("ALL");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsErr, setNewsErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [stocksLoading, setStocksLoading] = useState(true);
  /** 전일대비 등락률 ±N% 구간 돌파 시 브라우저 알림 (N은 5·10·15 중 선택) */
  const [changeRateAlertsOn, setChangeRateAlertsOn] = useState(false);
  const [alertThresholdPct, setAlertThresholdPct] = useState<ChangeRateAlertThresholdPct>(10);
  const [changeRateAlertErr, setChangeRateAlertErr] = useState<string | null>(null);
  const [addStockQuery, setAddStockQuery] = useState("");
  const [addStockItems, setAddStockItems] = useState<StockSearchItem[]>([]);
  const [addStockSearching, setAddStockSearching] = useState(false);
  const [addStockErr, setAddStockErr] = useState<string | null>(null);
  const [addStockRegistering, setAddStockRegistering] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [chartCollapsed, setChartCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_VISIBLE_COLUMNS);
  const addStockDialogRef = useRef<HTMLDialogElement>(null);
  const filterDialogRef = useRef<HTMLDialogElement>(null);
  const columnDialogRef = useRef<HTMLDialogElement>(null);
  const addStockSearchInputRef = useRef<HTMLInputElement>(null);

  useChangeRateAlerts(quotes, { enabled: changeRateAlertsOn, threshold: alertThresholdPct });
  const { tourOpen, openTour, finishTour } = useDashboardOnboarding();

  const openFilterDialog = useCallback(() => {
    filterDialogRef.current?.showModal();
  }, []);

  const closeFilterDialog = useCallback(() => {
    filterDialogRef.current?.close();
  }, []);

  const openColumnDialog = useCallback(() => {
    columnDialogRef.current?.showModal();
  }, []);

  const closeColumnDialog = useCallback(() => {
    columnDialogRef.current?.close();
  }, []);

  const resetDashboardFilters = useCallback(() => {
    setFilterText("");
    setMarketFilter("ALL");
    setSessionFilter("ALL");
    setNxtFilter("ALL");
    setThemeFilterIds([]);
  }, []);

  const toggleVisibleColumn = useCallback((key: ColumnKey) => {
    setVisibleColumns((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  }, []);

  useEffect(() => {
    setPinnedIds(readPinnedStockIdsFromStorage());
    setVisibleColumns(readVisibleColumnsFromStorage());
    const savedFilters = readDashboardBasicFiltersFromStorage();
    if (!savedFilters) return;
    setFilterText(savedFilters.filterText);
    setMarketFilter(savedFilters.marketFilter);
    setSessionFilter(savedFilters.sessionFilter);
    setNxtFilter(savedFilters.nxtFilter);
    setThemeFilterIds(savedFilters.themeFilterIds);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_MAX}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const data = await apiGet<{ preference: DashboardPreferenceApi }>("/me/preferences");
        if (!mounted) return;
        const p = data.preference;
        setPinnedIds(p.pinnedStockIds);
        setFilterText(p.filterText);
        setMarketFilter(p.marketFilter);
        setSessionFilter(p.sessionFilter);
        setNxtFilter(p.nxtFilter);
        setThemeFilterIds(p.themeFilterIds);
        if (p.changeAlertThreshold != null) {
          setAlertThresholdPct(parseChangeRateAlertThreshold(String(p.changeAlertThreshold)));
        }
      } catch {
        /* ignore - local fallback 사용 */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        DASHBOARD_BASIC_FILTERS_KEY,
        JSON.stringify({ filterText, marketFilter, sessionFilter, nxtFilter, themeFilterIds }),
      );
    } catch {
      /* ignore */
    }
  }, [filterText, marketFilter, sessionFilter, nxtFilter, themeFilterIds]);

  useEffect(() => {
    writeVisibleColumnsToStorage(visibleColumns);
  }, [visibleColumns]);

  useEffect(() => {
    const t = setTimeout(() => {
      void apiSend("/me/preferences", "PUT", {
        pinnedStockIds: pinnedIds,
        filterText,
        marketFilter,
        sessionFilter,
        nxtFilter,
        themeFilterIds,
        changeAlertThreshold: alertThresholdPct,
      }).catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [pinnedIds, filterText, marketFilter, sessionFilter, nxtFilter, themeFilterIds, alertThresholdPct]);

  useEffect(() => {
    if (stocksLoading) return;
    if (stocks.length === 0) return;
    const valid = new Set(stocks.map((s) => s.id));
    setPinnedIds((prev) => {
      const next = prev.filter((id) => valid.has(id));
      if (next.length === prev.length) return prev;
      writePinnedStockIdsToStorage(next);
      return next;
    });
  }, [stocks]);

  const openAddStockDialog = useCallback(() => {
    setAddStockErr(null);
    addStockDialogRef.current?.showModal();
    requestAnimationFrame(() => {
      addStockSearchInputRef.current?.focus();
    });
  }, []);

  const closeAddStockDialog = useCallback(() => {
    addStockDialogRef.current?.close();
  }, []);

  const onAddStockDialogClose = useCallback(() => {
    setAddStockQuery("");
    setAddStockItems([]);
    setAddStockErr(null);
  }, []);

  const togglePin = useCallback((stockId: string) => {
    setPinnedIds((prev) => {
      const has = prev.includes(stockId);
      const next = has ? prev.filter((id) => id !== stockId) : [...prev, stockId];
      writePinnedStockIdsToStorage(next);
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      setAlertThresholdPct(parseChangeRateAlertThreshold(localStorage.getItem("dashboard.changeRateAlertThreshold")));
      if (localStorage.getItem("dashboard.changeRateAlerts") !== "1") return;
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        setChangeRateAlertsOn(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleChangeRateAlerts = useCallback(async () => {
    setChangeRateAlertErr(null);
    if (changeRateAlertsOn) {
      setChangeRateAlertsOn(false);
      try {
        localStorage.setItem("dashboard.changeRateAlerts", "0");
      } catch {
        /* ignore */
      }
      return;
    }
    if (typeof Notification === "undefined") {
      setChangeRateAlertErr("이 브라우저는 알림을 지원하지 않습니다.");
      return;
    }
    if (Notification.permission === "denied") {
      setChangeRateAlertErr("브라우저 설정에서 이 사이트 알림을 허용해 주세요.");
      return;
    }
    let perm: NotificationPermission = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
    }
    if (perm !== "granted") {
      setChangeRateAlertErr("알림 권한이 필요합니다.");
      return;
    }
    setChangeRateAlertsOn(true);
    try {
      localStorage.setItem("dashboard.changeRateAlerts", "1");
    } catch {
      /* ignore */
    }
  }, [changeRateAlertsOn]);

  const refreshStocks = useCallback(async () => {
    setStocksLoading(true);
    try {
      setLoadErr(null);
      const data = await apiGet<{ stocks: StockApi[] }>("/stocks");
      setStocks(data.stocks);
    } catch {
      setLoadErr("종목 목록을 불러오지 못했습니다. API 서버를 확인하세요.");
    } finally {
      setStocksLoading(false);
    }
  }, []);

  const runAddStockSearch = useCallback(async () => {
    const q = addStockQuery.trim();
    if (!q) {
      setAddStockItems([]);
      return;
    }
    setAddStockSearching(true);
    setAddStockErr(null);
    try {
      const data = await apiGet<{ items: StockSearchItem[] }>(
        `/stocks/search?q=${encodeURIComponent(q)}&size=20`,
      );
      setAddStockItems(data.items);
    } catch (ex) {
      setAddStockErr(addStockSearchErrorMessage(ex));
    } finally {
      setAddStockSearching(false);
    }
  }, [addStockQuery]);

  const registerAddStock = useCallback(
    async (item: StockSearchItem) => {
      if (stocks.some((s) => s.code === item.code)) {
        setAddStockErr("이미 관심종목에 있는 종목입니다.");
        return;
      }
      setAddStockErr(null);
      setAddStockRegistering(item.code);
      try {
        const themeNames = [...new Set(item.themeNames.map((x) => x.trim()).filter(Boolean))];
        const res = await apiSend<{ stock: { id: string } }>("/stocks", "POST", {
          code: item.code,
          name: item.name,
          market: item.market?.trim() || null,
          industryMajorCode: item.industryMajorCode?.trim() || null,
          themeNames,
          isActive: true,
        });
        if (res?.stock?.id) {
          setSelectedId(res.stock.id);
        }
        setAddStockItems([]);
        setAddStockQuery("");
        await refreshStocks();
        closeAddStockDialog();
      } catch (ex) {
        setAddStockErr(addStockRegisterErrorMessage(ex));
      } finally {
        setAddStockRegistering(null);
      }
    },
    [stocks, refreshStocks, closeAddStockDialog],
  );

  useEffect(() => {
    void refreshStocks();
  }, [refreshStocks]);

  /** NXT 열은 KIS NX 프로브(종목 수×간격) 후 채워지므로 여러 번 목록 갱신 */
  useEffect(() => {
    const delays = [10_000, 35_000, 90_000];
    const timers = delays.map((ms) => window.setTimeout(() => void refreshStocks(), ms));
    return () => timers.forEach((t) => clearTimeout(t));
  }, [refreshStocks]);

  const selected = stocks.find((s) => s.id === selectedId) ?? null;

  const selectStock = useCallback((stockId: string) => {
    setSelectedId(stockId);
    setChartCollapsed(false);
  }, []);

  const openStockByCode = useCallback(
    (rawCode: string) => {
      const c = rawCode.trim();
      if (!c) return;
      const s = stocks.find(
        (x) => x.code === c || x.code.toLowerCase() === c.toLowerCase(),
      );
      if (!s) return;
      setFilterText("");
      setThemeFilterIds([]);
      setMarketFilter("ALL");
      setSessionFilter("ALL");
      setNxtFilter("ALL");
      selectStock(s.id);
    },
    [stocks, selectStock],
  );

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<DashboardOpenStockChartDetail>).detail;
      if (d?.code) openStockByCode(d.code);
    };
    window.addEventListener(DASHBOARD_OPEN_STOCK_CHART, onOpen);
    return () => window.removeEventListener(DASHBOARD_OPEN_STOCK_CHART, onOpen);
  }, [openStockByCode]);

  useEffect(() => {
    if (stocks.length === 0) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get(DASHBOARD_STOCK_CODE_QUERY);
    if (!code?.trim()) return;
    const next = new URLSearchParams(params);
    next.delete(DASHBOARD_STOCK_CODE_QUERY);
    const qs = next.toString();
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);
    openStockByCode(code);
  }, [stocks, openStockByCode]);

  useEffect(() => {
    if (!selectedId) return;
    const s = stocks.find((x) => x.id === selectedId);
    if (!s) {
      setSelectedId(null);
      return;
    }
    const q = filterText.trim().toLowerCase();
    if (themeFilterIds.length > 0 && !s.themes.some((t) => themeFilterIds.includes(t.id))) {
      setSelectedId(null);
      return;
    }
    if (marketFilter !== "ALL" && (s.market ?? "—") !== marketFilter) {
      setSelectedId(null);
      return;
    }
    const session = quotes.get(s.code)?.marketSession ?? "—";
    if (sessionFilter !== "ALL" && session !== sessionFilter) {
      setSelectedId(null);
      return;
    }
    if (nxtFilter !== "ALL") {
      const nxt = s.nxEligible === true ? "Y" : s.nxEligible === false ? "N" : "UNKNOWN";
      if (nxt !== nxtFilter) {
        setSelectedId(null);
        return;
      }
    }
    if (
      q &&
      !s.code.toLowerCase().includes(q) &&
      !s.name.toLowerCase().includes(q)
    ) {
      setSelectedId(null);
    }
  }, [selectedId, stocks, themeFilterIds, filterText, marketFilter, sessionFilter, nxtFilter, quotes]);

  const marketOptions = useMemo(() => {
    return [...new Set(stocks.map((s) => s.market ?? "—"))].sort((a, b) => a.localeCompare(b, "ko"));
  }, [stocks]);

  const sessionOptions = useMemo(() => {
    return [...new Set(stocks.map((s) => quotes.get(s.code)?.marketSession ?? "—"))].sort((a, b) => a.localeCompare(b, "ko"));
  }, [stocks, quotes]);

  const portfolioThemes = useMemo(() => {
    const m = new Map<string, ThemeBrief>();
    for (const s of stocks) {
      for (const t of s.themes) {
        if (!m.has(t.id)) m.set(t.id, t);
      }
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [stocks]);

  function toggleThemeFilter(themeId: string) {
    setThemeFilterIds((prev) =>
      prev.includes(themeId) ? prev.filter((id) => id !== themeId) : [...prev, themeId],
    );
  }

  const compareRows = useCallback(
    (a: StockApi, b: StockApi) => {
      if (!sortKey) return 0;
      const qa = quotes.get(a.code);
      const qb = quotes.get(b.code);
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") {
        return a.name.localeCompare(b.name, "ko") * dir;
      }
      if (sortKey === "price") {
        const pa = qa?.price ?? -Infinity;
        const pb = qb?.price ?? -Infinity;
        return pa === pb ? 0 : pa < pb ? -dir : dir;
      }
      if (sortKey === "changeRate") {
        const ra = qa?.changeRate ?? -Infinity;
        const rb = qb?.changeRate ?? -Infinity;
        return ra === rb ? 0 : ra < rb ? -dir : dir;
      }
      if (sortKey === "foreignNetBuyVolume") {
        const fa = qa?.foreignNetBuyVolume ?? -Infinity;
        const fb = qb?.foreignNetBuyVolume ?? -Infinity;
        return fa === fb ? 0 : fa < fb ? -dir : dir;
      }
      if (sortKey === "foreignOwnershipPct") {
        const fa = qa?.foreignOwnershipPct ?? -Infinity;
        const fb = qb?.foreignOwnershipPct ?? -Infinity;
        return fa === fb ? 0 : fa < fb ? -dir : dir;
      }
      const va = qa?.volume ?? -Infinity;
      const vb = qb?.volume ?? -Infinity;
      return va === vb ? 0 : va < vb ? -dir : dir;
    },
    [sortKey, sortDir, quotes],
  );

  useEffect(() => {
    if (!selectedId) {
      setNews([]);
      return;
    }
    let cancelled = false;
    setNewsErr(null);
    apiGet<{ news: NewsItem[] }>(`/stocks/${selectedId}/news`)
      .then((d) => {
        if (!cancelled) {
          setNews(d.news);
          setNewsErr(null);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setNews([]);
        if (e instanceof ApiError) {
          const body = e.body as { error?: { code?: string; message?: string } } | null;
          const msg = body?.error?.message;
          setNewsErr(msg ?? e.message ?? "뉴스를 불러오지 못했습니다.");
        } else {
          setNewsErr("뉴스를 불러오지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) setChartCollapsed(false);
  }, [selectedId]);

  const rows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const filtered = stocks.filter((s) => {
      if (themeFilterIds.length > 0) {
        if (!s.themes.some((t) => themeFilterIds.includes(t.id))) return false;
      }
      if (marketFilter !== "ALL" && (s.market ?? "—") !== marketFilter) return false;
      const session = quotes.get(s.code)?.marketSession ?? "—";
      if (sessionFilter !== "ALL" && session !== sessionFilter) return false;
      if (nxtFilter !== "ALL") {
        const nxt = s.nxEligible === true ? "Y" : s.nxEligible === false ? "N" : "UNKNOWN";
        if (nxt !== nxtFilter) return false;
      }
      if (!q) return true;
      return s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    });

    const pinnedRows = pinnedIds
      .map((id) => filtered.find((s) => s.id === id))
      .filter((s): s is StockApi => s != null);
    const pinnedSorted = [...pinnedRows].sort(compareRows);
    const pinnedSet = new Set(pinnedRows.map((s) => s.id));
    const unpinnedSorted = filtered.filter((s) => !pinnedSet.has(s.id)).sort(compareRows);
    return [...pinnedSorted, ...unpinnedSorted];
  }, [
    stocks,
    filterText,
    themeFilterIds,
    marketFilter,
    sessionFilter,
    nxtFilter,
    pinnedIds,
    compareRows,
  ]);

  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    setSortKey(null);
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "▲" : "▼";
  }

  const alertExplainerTitle = `전일 대비 등락률이 +${alertThresholdPct}% 또는 −${alertThresholdPct}%를 넘을 때 알림을 보냅니다. 상·하 방향 모두 동일 기준입니다. 같은 구간에서는 한 번만 울리며, 등락률이 각각 ${alertThresholdPct - 1}%·−${alertThresholdPct - 1}% 쪽으로 충분히 되돌아온 뒤 다시 ±${alertThresholdPct}%를 넘으면 그때 다시 알립니다.`;
  const headerButtonClass = "btn btn-secondary dashboard-control-btn";
  const activeVisibleColumns = useMemo(() => {
    const allowed = new Set<ColumnKey>(visibleColumns);
    const ordered = DEFAULT_VISIBLE_COLUMNS.filter((key) => allowed.has(key));
    return ordered.length > 0 ? ordered : DEFAULT_VISIBLE_COLUMNS;
  }, [visibleColumns]);

  const renderHeaderCell = (key: ColumnKey) => {
    if (key === "pin") {
      return (
        <th key={key} style={{ width: 44, textAlign: "center" }} scope="col" title="목록 상단에 고정">
          고정
        </th>
      );
    }
    if (key === "name") {
      return (
        <th key={key} style={{ cursor: "pointer" }} scope="col" onClick={() => toggleSort("name")}>
          종목 {sortIndicator("name")}
        </th>
      );
    }
    if (key === "market") {
      return (
        <th key={key} style={{ width: 52, textAlign: "center" }} scope="col" title="KOSPI / KOSDAQ / KONEX">
          시장
        </th>
      );
    }
    if (key === "nxt") {
      return (
        <th key={key} style={{ width: 56, textAlign: "center" }} scope="col" title="넥스트(NXT) 시간외 거래 시세 조회 가능 여부(KIS)">
          NXT
        </th>
      );
    }
    if (key === "price") {
      return (
        <th key={key} className="num" style={{ cursor: "pointer" }} scope="col" onClick={() => toggleSort("price")}>
          현재가 {sortIndicator("price")}
        </th>
      );
    }
    if (key === "changeRate") {
      return (
        <th key={key} className="num" style={{ cursor: "pointer" }} scope="col" onClick={() => toggleSort("changeRate")}>
          등락률 {sortIndicator("changeRate")}
        </th>
      );
    }
    if (key === "volume") {
      return (
        <th key={key} className="num" style={{ cursor: "pointer" }} scope="col" onClick={() => toggleSort("volume")}>
          거래량 {sortIndicator("volume")}
        </th>
      );
    }
    if (key === "foreignNetBuyVolume") {
      return (
        <th
          key={key}
          className="num"
          style={{ cursor: "pointer" }}
          scope="col"
          onClick={() => toggleSort("foreignNetBuyVolume")}
          title="당일 외국인 순매수 수량(주). 투자자 수급 TR 기준"
        >
          외인순매수 {sortIndicator("foreignNetBuyVolume")}
        </th>
      );
    }
    if (key === "foreignOwnershipPct") {
      return (
        <th
          key={key}
          className="num"
          style={{ cursor: "pointer" }}
          scope="col"
          onClick={() => toggleSort("foreignOwnershipPct")}
          title="외국인 소진율(%)"
        >
          외인% {sortIndicator("foreignOwnershipPct")}
        </th>
      );
    }
    return (
      <th key={key} scope="col">
        세션
      </th>
    );
  };

  return (
    <div className="dashboard-root">
      <header className="dashboard-header">
        <div className="dashboard-header-top">
          <div className="dashboard-header-title-row">
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}>
              <div className="dashboard-title">관심종목 모니터링</div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: "4px 10px", flexShrink: 0 }}
                data-tour="help-replay"
                aria-label="화면 설명 다시 보기"
                onClick={openTour}
              >
                사용법
              </button>
            </div>
            <div className="dashboard-header-badges">
              <span className="badge dashboard-ws-badge">{connected ? "WS 연결됨" : "WS 재연결 중"}</span>
              {statusMsg ? (
                <span className="badge dashboard-ws-badge" title={statusMsg}>
                  {statusMsg}
                </span>
              ) : null}
            </div>
          </div>
          <div className="dashboard-header-actions">
            <div className="dashboard-desktop-toolbar" data-tour="desktop-toolbar">
              <select value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)} aria-label="시장 필터">
                <option value="ALL">시장: 전체</option>
                {marketOptions.map((market) => (
                  <option key={market} value={market}>
                    시장: {market}
                  </option>
                ))}
              </select>
              <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} aria-label="세션 필터">
                <option value="ALL">세션: 전체</option>
                {sessionOptions.map((session) => (
                  <option key={session} value={session}>
                    세션: {session}
                  </option>
                ))}
              </select>
              <select value={nxtFilter} onChange={(e) => setNxtFilter(e.target.value)} aria-label="NXT 필터">
                <option value="ALL">NXT: 전체</option>
                <option value="Y">NXT: 가능</option>
                <option value="N">NXT: 미적격</option>
                <option value="UNKNOWN">NXT: 확인중</option>
              </select>
              <div
                style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}
                title={alertExplainerTitle}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input type="checkbox" checked={changeRateAlertsOn} onChange={() => void toggleChangeRateAlerts()} />
                  등락률 알림
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted-foreground)" }}>
                  기준
                  <select
                    value={alertThresholdPct}
                    onChange={(e) => {
                      const v = parseChangeRateAlertThreshold(e.target.value);
                      setAlertThresholdPct(v);
                      try {
                        localStorage.setItem("dashboard.changeRateAlertThreshold", String(v));
                      } catch {
                        /* ignore */
                      }
                    }}
                    style={{ fontSize: 12, padding: "2px 6px" }}
                    aria-label="등락률 알림 기준(상·하 동일)"
                  >
                    {CHANGE_RATE_ALERT_THRESHOLDS.map((t) => (
                      <option key={t} value={t}>
                        ±{t}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {changeRateAlertErr ? (
                <span style={{ fontSize: 11, color: "var(--down)", maxWidth: 220 }}>{changeRateAlertErr}</span>
              ) : null}
            </div>
            <div data-tour="theme-settings" style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <ThemeToggle className={`${headerButtonClass} dashboard-theme-toggle`} />
              <button
                type="button"
                className={`${headerButtonClass} dashboard-mobile-filter-btn`}
                data-tour="mobile-filter"
                onClick={openFilterDialog}
              >
                필터
              </button>
              <Link href="/admin/stocks" className={`${headerButtonClass} dashboard-settings-btn`}>
                설정
              </Link>
            </div>
          </div>
        </div>
        <div className="dashboard-search-row" data-tour="search-row">
          <input
            className="dashboard-filter-input"
            placeholder="종목명·코드 필터"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            aria-label="종목명·코드 필터"
          />
          <button type="button" className={`${headerButtonClass} dashboard-reset-filters-btn`} onClick={resetDashboardFilters}>
            초기화
          </button>
        </div>
      </header>

      <dialog ref={filterDialogRef} className="dashboard-filter-dialog" aria-labelledby="dashboard-filter-dialog-title">
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 id="dashboard-filter-dialog-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              상세 필터·알림
            </h2>
            <button type="button" className="btn btn-secondary" onClick={closeFilterDialog} aria-label="닫기">
              닫기
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span className="text-muted-foreground">시장</span>
              <select value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)} aria-label="시장 필터">
                <option value="ALL">전체</option>
                {marketOptions.map((market) => (
                  <option key={market} value={market}>
                    {market}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span className="text-muted-foreground">세션</span>
              <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} aria-label="세션 필터">
                <option value="ALL">전체</option>
                {sessionOptions.map((session) => (
                  <option key={session} value={session}>
                    {session}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span className="text-muted-foreground">NXT</span>
              <select value={nxtFilter} onChange={(e) => setNxtFilter(e.target.value)} aria-label="NXT 필터">
                <option value="ALL">전체</option>
                <option value="Y">가능</option>
                <option value="N">미적격</option>
                <option value="UNKNOWN">확인중</option>
              </select>
            </label>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>테마 필터</div>
            {portfolioThemes.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>표시할 테마가 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {portfolioThemes.map((t) => {
                  const on = themeFilterIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleThemeFilter(t.id)}
                      className={on ? "primary" : "btn btn-secondary"}
                      style={{ fontSize: 12, padding: "4px 10px" }}
                      title={on ? "필터 적용됨" : "필터에 추가"}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
            {themeFilterIds.length > 0 ? (
              <button type="button" className="btn btn-secondary" style={{ width: "fit-content" }} onClick={() => setThemeFilterIds([])}>
                테마 필터 전체 해제
              </button>
            ) : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }} title={alertExplainerTitle}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={changeRateAlertsOn} onChange={() => void toggleChangeRateAlerts()} />
              등락률 알림
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted-foreground)" }}>
              알림 기준
              <select
                value={alertThresholdPct}
                onChange={(e) => {
                  const v = parseChangeRateAlertThreshold(e.target.value);
                  setAlertThresholdPct(v);
                  try {
                    localStorage.setItem("dashboard.changeRateAlertThreshold", String(v));
                  } catch {
                    /* ignore */
                  }
                }}
                aria-label="등락률 알림 기준(상·하 동일)"
              >
                {CHANGE_RATE_ALERT_THRESHOLDS.map((t) => (
                  <option key={t} value={t}>
                    ±{t}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          {changeRateAlertErr ? <div style={{ fontSize: 12, color: "var(--down)" }}>{changeRateAlertErr}</div> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={resetDashboardFilters}>
              조건 초기화
            </button>
            <button type="button" className="primary" onClick={closeFilterDialog}>
              적용·닫기
            </button>
          </div>
        </div>
      </dialog>

      {loadErr ? (
        <div style={{ padding: 12, color: "var(--down)" }}>{loadErr}</div>
      ) : null}

      <div className="dashboard-grid">
        <div className="panel dashboard-panel-watchlist" data-tour="watchlist-panel">
          <div className="panel-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span>관심종목</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={openColumnDialog}>
                컬럼설정
              </button>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={openAddStockDialog}>
                종목 추가
              </button>
            </div>
          </div>
          <dialog ref={columnDialogRef} className="dashboard-filter-dialog" aria-labelledby="dashboard-column-dialog-title">
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <h2 id="dashboard-column-dialog-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  표시 컬럼 선택
                </h2>
                <button type="button" className="btn btn-secondary" onClick={closeColumnDialog} aria-label="닫기">
                  닫기
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
                좁은 화면에서는 표를 가로로 스크롤해 모든 컬럼을 볼 수 있습니다.
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {COLUMN_OPTIONS.map((option) => (
                  <label key={option.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(option.key)}
                      onChange={() => toggleVisibleColumn(option.key)}
                      aria-label={`${option.label} 컬럼 표시`}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}>
                  기본값으로 복원
                </button>
                <button type="button" className="primary" onClick={closeColumnDialog}>
                  적용·닫기
                </button>
              </div>
            </div>
          </dialog>
          <dialog
            ref={addStockDialogRef}
            className="add-stock-dialog"
            aria-labelledby="add-stock-dialog-title"
            onClose={onAddStockDialogClose}
          >
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <h2 id="add-stock-dialog-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  종목 추가
                </h2>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: 12 }}
                  onClick={closeAddStockDialog}
                  aria-label="닫기"
                >
                  닫기
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
                종목명 또는 코드로 검색한 뒤 등록합니다.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <input
                  ref={addStockSearchInputRef}
                  placeholder="종목명·코드 검색"
                  value={addStockQuery}
                  onChange={(e) => setAddStockQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void runAddStockSearch();
                    }
                  }}
                  style={{ minWidth: 160, flex: "1 1 160px" }}
                  aria-label="종목 검색"
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: 12 }}
                  disabled={addStockSearching}
                  onClick={() => void runAddStockSearch()}
                >
                  {addStockSearching ? "검색 중…" : "검색"}
                </button>
              </div>
              {addStockErr ? (
                <p style={{ margin: 0, fontSize: 12, color: "var(--down)" }}>{addStockErr}</p>
              ) : null}
              {addStockItems.length > 0 ? (
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    maxHeight: 240,
                    overflow: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  {addStockItems.map((it) => {
                    const already = stocks.some((s) => s.code === it.code);
                    const reg = addStockRegistering === it.code;
                    return (
                      <li
                        key={it.code}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          padding: "6px 8px",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{it.name}</div>
                          <div style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
                            {it.code}
                            {it.market ? ` · ${it.market}` : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="primary"
                          style={{ fontSize: 12, flexShrink: 0, whiteSpace: "nowrap" }}
                          disabled={already || reg}
                          onClick={() => void registerAddStock(it)}
                        >
                          {already ? "등록됨" : reg ? "등록 중…" : "등록"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </dialog>
          <div className="dashboard-watchlist-body">
          <div className="dashboard-watchlist-scroll">
          <div className="panel-b dashboard-watchlist-panel-b" style={{ padding: "0 8px 8px" }}>
            <div className="dashboard-watchlist-table-wrap">
            <table className="data-table data-table-watchlist">
              <thead>
                <tr>
                  {activeVisibleColumns.map((key) => renderHeaderCell(key))}
                </tr>
              </thead>
              <tbody>
                {stocksLoading && stocks.length === 0 ? (
                  <tr>
                    <td colSpan={activeVisibleColumns.length} style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <span className="loading-dot" aria-hidden />
                        종목 목록을 불러오는 중…
                      </span>
                    </td>
                  </tr>
                ) : null}
                {rows.map((s) => {
                  const q = quotes.get(s.code);
                  const sel = s.id === selectedId;
                  const cr = q?.changeRate ?? null;
                  const crCls = cr === null ? "" : cr > 0 ? "up" : cr < 0 ? "down" : "";
                  const fn = q?.foreignNetBuyVolume ?? null;
                  const fnCls = fn === null ? "" : fn > 0 ? "up" : fn < 0 ? "down" : "";
                  const isPinned = pinnedIds.includes(s.id);
                  return (
                    <tr
                      key={s.id}
                      className={sel ? "selected" : undefined}
                      style={{ cursor: "pointer" }}
                      onClick={() => selectStock(s.id)}
                    >
                      {activeVisibleColumns.map((key) => {
                        if (key === "pin") {
                          return (
                            <td key={key} style={{ textAlign: "center", verticalAlign: "middle", width: 44 }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: 11, padding: "2px 6px", minWidth: 32 }}
                                aria-label={isPinned ? "상단 고정 해제" : "목록 상단에 고정"}
                                aria-pressed={isPinned}
                                title={isPinned ? "상단 고정 해제" : "목록 상단에 고정"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePin(s.id);
                                }}
                              >
                                {isPinned ? "★" : "☆"}
                              </button>
                            </td>
                          );
                        }
                        if (key === "name") {
                          return (
                            <td key={key}>
                              <div style={{ fontWeight: 600 }}>{s.name}</div>
                              <div style={{ color: "var(--muted-foreground)", fontSize: 11 }}>{s.code}</div>
                            </td>
                          );
                        }
                        if (key === "market") {
                          return (
                            <td key={key} style={{ textAlign: "center", fontSize: 11, color: "var(--muted-foreground)" }}>
                              {s.market ?? "—"}
                            </td>
                          );
                        }
                        if (key === "nxt") {
                          return (
                            <td key={key} style={{ textAlign: "center", verticalAlign: "middle" }}>
                              {s.nxEligible === true ? (
                                <span className="badge" title="넥스트(NXT) 시간외 매매 시세 사용 가능">
                                  NXT
                                </span>
                              ) : s.nxEligible === false ? (
                                <span
                                  style={{ color: "var(--muted-foreground)", fontSize: 12 }}
                                  title="현재 NXT 미적격(일시 실패 포함). 서버가 주기적으로 재확인합니다."
                                >
                                  —
                                </span>
                              ) : (
                                <span style={{ color: "var(--muted-foreground)", fontSize: 11 }} title="KIS에서 아직 확인하지 않음">
                                  …
                                </span>
                              )}
                            </td>
                          );
                        }
                        if (key === "price") {
                          return (
                            <td key={key} className="num">
                              {q ? formatQuotePrice(q) : "—"}
                            </td>
                          );
                        }
                        if (key === "changeRate") {
                          return (
                            <td key={key} className={`num ${crCls}`}>
                              {q ? `${q.changeRate >= 0 ? "+" : ""}${q.changeRate.toFixed(2)}%` : "—"}
                            </td>
                          );
                        }
                        if (key === "volume") {
                          return (
                            <td key={key} className="num">
                              {q ? q.volume.toLocaleString("ko-KR") : "—"}
                            </td>
                          );
                        }
                        if (key === "foreignNetBuyVolume") {
                          return (
                            <td key={key} className={`num ${fnCls}`}>
                              {q ? formatForeignNetVol(q.foreignNetBuyVolume) : "—"}
                            </td>
                          );
                        }
                        if (key === "foreignOwnershipPct") {
                          return (
                            <td key={key} className="num">
                              {q ? formatForeignPct(q.foreignOwnershipPct) : "—"}
                            </td>
                          );
                        }
                        return <td key={key}>{q?.marketSession ?? "—"}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
          </div>
          <div className="dashboard-watchlist-chart-section" data-tour="chart-area">
          {selected && !chartCollapsed ? (
            <div
              style={{
                borderTop: "1px solid var(--border)",
                flex: isMobile ? "1 1 auto" : undefined,
                minHeight: isMobile ? 0 : undefined,
                background: "var(--background)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: 12,
                  paddingTop: 8,
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <PriceChartPanel
                  stockId={selected.id}
                  stockName={selected.name}
                  stockCode={selected.code}
                  industryMajorName={selected.industryMajorName}
                  themeNames={selected.themes.map((t) => t.name)}
                  liveQuote={quotes.get(selected.code)}
                  fillHeight={isMobile}
                  compactHeader={isMobile}
                  onFold={() => setChartCollapsed(true)}
                />
              </div>
            </div>
          ) : (
            <div
              style={{
                borderTop: "1px solid var(--border)",
                padding: 12,
                fontSize: 12,
                color: "var(--muted-foreground)",
                flex: isMobile ? "1 1 auto" : undefined,
                minHeight: isMobile ? 0 : undefined,
              }}
            >
              {selected
                ? "차트를 접었습니다. 종목을 다시 선택하면 차트가 다시 열립니다."
                : "종목을 선택하면 가격 추이 차트(분·일·월·년)가 표시됩니다."}
            </div>
          )}
          </div>
          </div>
        </div>

        {!isMobile ? <div className="panel dashboard-panel-theme">
          <div className="panel-h">테마</div>
          <div className="panel-b" style={{ flex: 1 }}>
            <div style={{ marginBottom: 10, color: "var(--muted-foreground)", fontSize: 12, lineHeight: 1.4 }}>
              관심종목에 연결된 테마입니다. 클릭하면 목록에{" "}
              <strong style={{ color: "var(--text)" }}>포함(OR)</strong>·다시 클릭하면 조건에서 뺍니다.
            </div>
            {portfolioThemes.length === 0 ? (
              <div style={{ color: "var(--muted-foreground)" }}>표시할 테마가 없습니다. 종목에 테마를 연결하세요.</div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {portfolioThemes.map((t) => {
                    const on = themeFilterIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleThemeFilter(t.id)}
                        className={on ? "primary" : "btn btn-secondary"}
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        title={on ? "필터 적용됨" : "필터에 추가"}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
                {themeFilterIds.length > 0 ? (
                  <button type="button" style={{ marginTop: 10 }} onClick={() => setThemeFilterIds([])}>
                    테마 필터 전체 해제
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div> : null}

        <div className="panel dashboard-panel-news" data-tour="news-panel">
          <div className="panel-h">관련 뉴스</div>
          <div style={{ padding: "0 12px 6px", fontSize: 11, color: "var(--muted-foreground)" }}>
            최근 약 3개월(90일) 이내 기사만 표시합니다.
            {selected ? (
              <>
                {" "}
                · 선택: <strong style={{ color: "var(--text)" }}>{selected.name}</strong>
              </>
            ) : null}
          </div>
          <div className="panel-b">
            {!selectedId ? (
              <div style={{ color: "var(--muted-foreground)" }}>종목을 선택하세요.</div>
            ) : newsErr ? (
              <div style={{ color: "var(--down)" }}>{newsErr}</div>
            ) : news.length === 0 ? (
              <div style={{ color: "var(--muted-foreground)" }}>표시할 뉴스가 없습니다.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {news.map((n) => (
                  <li key={n.id} style={{ marginBottom: 10 }}>
                    <a href={n.url} target="_blank" rel="noreferrer">
                      {n.title}
                    </a>
                    <div style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
                      {n.source} · {new Date(n.publishedAt).toLocaleString("ko-KR")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <DashboardOnboardingTour open={tourOpen} onFinish={finishTour} />
    </div>
  );
}
