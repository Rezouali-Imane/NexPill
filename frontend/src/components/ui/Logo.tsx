import s from "./Logo.module.css";
import logoUrl from "@/assets/logo.svg";

export function Logo() {
  return <img className={s.logo} src={logoUrl} alt="Nexpill" />;
}
