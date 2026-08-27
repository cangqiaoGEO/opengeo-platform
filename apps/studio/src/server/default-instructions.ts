/**
 * The two briefs a brand starts with. They live apart from the server functions
 * so a script — or a test — can read them without pulling in the session guard.
 */

export const DEFAULT_ARTICLE_INSTRUCTION = `你在为一家中国制造企业写面向海外采购决策者的文章。

结构（八段式）：
1. 标题
2. 40–80 字的核心答案，直接回答标题里的问题
3. 问题背景：这个采购决策难在哪
4. 判断标准：给出可核对的参数或流程，不要形容词
5. 我们的做法：只引用事实库条目，每条都要能对应到一个 factEntryId
6. 常见误区
7. 选型建议：给出适用与不适用的场景
8. FAQ 五问五答

硬性要求：
- 全文只允许陈述事实库里有的事实；库里没有的一律不写，不要用"业内领先""高品质"这类无法核对的表述替代
- 每一个涉及数字、认证、产能、交期的断言，必须在 citations 里给出对应的 factEntryId
- 不确定但对文章重要的点，写进 unsupportedClaims，不要写进正文
- 不使用"最""第一""唯一""国家级"等绝对化用语
- 正文不少于 800 字`;

export const DEFAULT_TITLE_INSTRUCTION = `写一个面向海外 B2B 采购者的标题。

要求：
- 直接对应给定的检索问题，读者一眼能看出这篇回答的是不是他的问题
- 不用感叹号、不用"揭秘""震惊"这类钩子
- 不出现绝对化用语
- 不超过 30 个字`;
