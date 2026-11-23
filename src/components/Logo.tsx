// Logo oficial do LYD CRM (mesma imagem do topo do lydcrm.com).
export function Logo({ grande = false }: { grande?: boolean }) {
  return <img src="/marca/lyd-logo.webp" alt="LYD CRM" className={grande ? "logo logo--grande" : "logo"} width={232} height={120} />;
}
