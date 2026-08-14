import styles from "./instrument-section.module.css";
import type { CompanyExecutives } from "../../server/f10.server";

/*
 * 公司高管分区。
 *
 * 这是真的表格数据——姓名、职务、起止日期之间有行列关系，所以用 <table>
 * 而不是拿 div 堆一个看起来像表格的东西：后者屏幕阅读器读不出对应关系。
 *
 * 「在任」不是一个日期。上游用「--」表示还在任，这里显式写成「在任」，
 * 而不是留空——留空看起来像「这个人的离任日期没披露」。
 */

const term = (endedOn: string | null): string => endedOn ?? "在任";

export function CompanyExecutivesSection({
  executives,
}: Readonly<{ executives: CompanyExecutives }>) {
  return (
    <>
      {executives.groups.map((group) => (
        <section className={styles.card} key={group.title}>
          <h2 className={styles.cardTitle}>
            {group.title}
            <span className={styles.count}>{group.members.length} 人次</span>
          </h2>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">姓名</th>
                  <th scope="col">职务</th>
                  <th scope="col">起始日期</th>
                  <th scope="col">终止日期</th>
                </tr>
              </thead>
              <tbody>
                {group.members.map((member, index) => (
                  <tr key={`${member.name}-${member.role}-${index.toString()}`}>
                    <th scope="row">{member.name}</th>
                    <td>{member.role}</td>
                    <td>{member.startedOn}</td>
                    <td>{term(member.endedOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
