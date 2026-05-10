import { redirect } from "next/navigation";

/** 예전 `/contact` 북마크는 관리 영역 문의로 연결 */
export default function ContactRedirectPage() {
  redirect("/admin/inquiries");
}
