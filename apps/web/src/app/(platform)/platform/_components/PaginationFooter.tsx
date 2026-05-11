"use client";

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  disabled?: boolean;
};

export function PaginationFooter({ page, totalPages, onPageChange, disabled }: Props) {
  return (
    <div
      className="platform-pagination"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
        marginTop: 20,
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        className={`btn btn-secondary${page <= 1 ? " opacity-50" : ""}`}
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="이전 페이지"
      >
        ‹ 이전
      </button>
      <span style={{ fontSize: 13, color: "var(--muted-foreground)" }} aria-current="page">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        className={`btn btn-secondary${page >= totalPages ? " opacity-50" : ""}`}
        disabled={disabled || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="다음 페이지"
      >
        다음 ›
      </button>
    </div>
  );
}
