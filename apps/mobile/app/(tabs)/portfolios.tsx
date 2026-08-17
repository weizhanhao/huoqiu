import { useCallback } from "react";

import { fetchPortfolios } from "../../src/api/market-api";
import { PortfolioScreen } from "../../src/components/markets/portfolio-screen";
import { useRemote } from "../../src/hooks/use-remote";
import { useAccountSession } from "../../src/session/account-session";

/*
 * 组合。
 *
 * 这里原先渲染的是 getPortfolioHub(period)——写死的合成榜单。现在是这个账号
 * 自己建的和关注的组合，和网页版同一份。
 */
export default function PortfoliosScreen() {
  const { account, callAs } = useAccountSession();

  /* callAs 随令牌变化，登录/退出后会自然重取。 */
  const load = useCallback(() => callAs(fetchPortfolios), [callAs]);
  const { failure, loading, refresh, value } = useRemote(load);

  return (
    <PortfolioScreen
      failure={failure}
      loading={loading}
      onRefresh={refresh}
      sets={value}
      signedIn={account !== null}
    />
  );
}
