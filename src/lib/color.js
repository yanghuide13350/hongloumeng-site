// 全站配色常量（构建时与客户端 island 共享，避免四处重复维护）

// 家族 → 配色（关系图谱着色、人物卡、命运卡）
export const FAMILY_COLOR = {
  贾家: '#9E3D32', 史家: '#3A4A52', 王家: '#6B7B45', 薛家: '#B08D57',
  林家: '#4F6457', 甄家: '#8C5A6B', 方外: '#7A7A85', 市井: '#9A8164',
  外姓: '#5A6E78', 宗室: '#A8612F', 尤家: '#996A8A', 李家: '#54705C',
};

// 词条类型 → 配色（搜索结果、顶栏即时检索着色）
export const TYPE_COLOR = {
  人物: '#9E3D32', 诗词: '#B08D57', 章节: '#3A4A52', 主题: '#6B7B45', 线索: '#8C5A6B',
  地点: '#4F6457', 事件: '#A8612F', 器物: '#7A7A85', 民俗: '#54705C', 图表: '#5A6E78',
};

export const familyColor = (f) => FAMILY_COLOR[f] ?? '#8C887E';
export const typeColor = (t) => TYPE_COLOR[t] ?? null;
