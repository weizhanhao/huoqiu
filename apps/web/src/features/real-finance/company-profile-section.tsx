import styles from "./instrument-section.module.css";
import type { CompanyProfile } from "../../server/f10.server";

/*
 * 公司简介分区。
 *
 * 只渲染上游真的给了的字段：值为 null 的那一项整条不出现，而不是渲染成
 * 「注册资本：—」。后者看起来像「这家公司没有注册资本」，那是编造。
 *
 * 单位是核对过的，不是猜的：
 *   注册资本 18461.7902 与总股本 184,617,902 股、面值 1 元吻合 → 万元
 *   募集资金 1119331500 → 元
 */

const YUAN_PER_YI = 100_000_000;

const formatWanYuan = (value: number): string =>
  `${value.toLocaleString("zh-CN", { maximumFractionDigits: 4 })} 万元`;

const formatYi = (value: number): string =>
  `${(value / YUAN_PER_YI).toLocaleString("zh-CN", {
    maximumFractionDigits: 4,
  })} 亿元`;

type Fact = Readonly<{ label: string; value: string }>;

/** 只留下真的有值的项；null 的直接不进列表。 */
const buildFacts = (profile: CompanyProfile): readonly Fact[] => {
  const candidates: readonly Readonly<{
    label: string;
    value: string | null;
  }>[] = [
    { label: "公司全称", value: profile.chineseName },
    { label: "英文名称", value: profile.englishName },
    { label: "证券类别", value: profile.securityType },
    { label: "上市市场", value: profile.market },
    { label: "所属行业", value: profile.industry },
    { label: "法人代表", value: profile.legalPerson },
    { label: "董事会秘书", value: profile.secretary },
    { label: "成立日期", value: profile.foundedOn },
    { label: "上市日期", value: profile.listedOn },
    {
      label: "注册资本",
      value:
        profile.registeredCapital === null
          ? null
          : formatWanYuan(profile.registeredCapital),
    },
    {
      label: "员工人数",
      value:
        profile.employees === null ? null : `${profile.employees.toString()} 人`,
    },
    {
      label: "发行价格",
      value:
        profile.issuePrice === null
          ? null
          : `${profile.issuePrice.toString()} 元/股`,
    },
    {
      label: "募集资金",
      value: profile.raisedFunds === null ? null : formatYi(profile.raisedFunds),
    },
    { label: "联系电话", value: profile.phone },
    { label: "公司网址", value: profile.website },
    { label: "注册地址", value: profile.registeredAddress },
    { label: "办公地址", value: profile.address },
  ];

  return candidates.filter(
    (candidate): candidate is Fact => candidate.value !== null,
  );
};

export function CompanyProfileSection({
  profile,
}: Readonly<{ profile: CompanyProfile }>) {
  const facts = buildFacts(profile);

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>基本资料</h2>
        <dl className={styles.facts}>
          {facts.map((fact) => (
            <div className={styles.fact} key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {profile.profile === null ? null : (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>公司简介</h2>
          <p className={styles.prose}>{profile.profile}</p>
        </section>
      )}

      {profile.businessScope === null ? null : (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>经营范围</h2>
          <p className={styles.prose}>{profile.businessScope}</p>
        </section>
      )}
    </>
  );
}
