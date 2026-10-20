export const DIMS = {
  length: 290,
  width: 271,
  height: 51.3,
  seats: 60000,
  steel: 18000,
  openingX: 180,
  openingZ: 130,
  cantilever: 68.4,
  gfa: 136000,
  roofUnits: 20,
};

export const VIEWS = {
  shore: {
    label: '湖岸',
    en: 'LAKEFRONT',
    caption:
      '从水岸望去，20 组六边形晶体沿椭圆环向生长并彼此共边：每个单元以一枚外凸顶点为核，六条棱线向外放射，上部磨砂玻璃、下部暖灰石材。',
    position: [138, 32, 466],
    target: [0, 24, 0],
    fov: 38,
  },
  orbit: {
    label: '鸟瞰',
    en: 'AERIAL',
    caption:
      '屋盖笼罩整个坐席区，第三层看台只沿两条长边展开，球门后方收于二层，屋面因此在短边一侧敞开，露出一圈深色墙身。',
    position: [290, 175, 430],
    target: [0, 19, 0],
    fov: 35,
  },
  elevation: {
    label: '立面',
    en: 'ELEVATION',
    caption:
      '六边形单元平顶、外凸腰线、收分基座。最高点 51.3 米，谷线与峰线相差约 14 米，在立面上形成连续的晶体锯齿轮廓。',
    position: [0, 33, 430],
    target: [0, 25, 0],
    fov: 26,
  },
  field: {
    label: '内场',
    en: 'PITCH',
    caption:
      '九道田径场与足球场按 90% 嵌入下沉看台，一层首排直接落在跑道外的缓冲坪上。磨砂折面与深灰三角桁架覆盖坐席，二层顶端立着 LED 大屏。',
    position: [46, -4.8, 41],
    target: [-34, 0.2, -34],
    fov: 64,
  },
  stands: {
    label: '看台',
    en: 'STANDS',
    caption:
      '三层看台由两条等高玻璃环带分开，深灰座椅沿椭圆逐排抬升；二层顶部与三层底部之间的净距处处相同，第三层只沿长边展开、顶缘向两端平滑下落；球门后方只有两层，二层顶端悬挂 LED 大屏。',
    position: [0, 3.2, 54],
    target: [-92, 2.2, -4],
    fov: 59,
  },
  roof: {
    label: '屋盖',
    en: 'ROOF',
    caption:
      '屋盖中部开口 180 × 130 米，最大悬挑 68.4 米。折面既是围护结构，也是受力结构本身。',
    position: [118, 108, 142],
    target: [0, 31, 0],
    fov: 44,
  },
  free: {
    label: '自由',
    en: 'FREE FLY',
    caption:
      '自由视角：不受地面约束。WASD 沿视线平移，Space 上升、Shift 下降，滚轮调整焦距，可贴着晶体折面绕行整座体育场。',
    position: [186, 88, 248],
    target: [0, 24, 0],
    fov: 55,
  },
};

export const LIGHT_MODES = {
  crystal: {
    name: '冰晶白',
    en: 'CRYSTAL',
    desc: '以 4,000K 冷白洗亮半透明折面，回应“水晶石”的原始概念。',
    swatch: '#ecf4ee',
    color: 0xe8fff4,
    accent: 0xb8ffdc,
    intensity: 1.0,
  },
  emerald: {
    name: '翡翠绿',
    en: 'EMERALD',
    desc: '建筑在日光下呈灰绿色；夜间以克制的翡翠绿延续这一印象。',
    swatch: '#56d9a4',
    color: 0x63ffc0,
    accent: 0x1fe08f,
    intensity: 1.15,
  },
  ice: {
    name: '大运蓝',
    en: 'ICE BLUE',
    desc: '冷蓝光沿三角折面漫射，使钢与膜呈现出类似冰层的透明度。',
    swatch: '#6fcfff',
    color: 0x74d8ff,
    accent: 0x2e8dff,
    intensity: 1.05,
  },
  gala: {
    name: '盛典',
    en: 'GALA',
    desc: '2011 年赛事期间的多彩照明：色相沿建筑环向缓慢流动。',
    swatch: 'linear-gradient(90deg,#ff9d55,#ef4f88,#7d6bff,#53e2c0)',
    color: 0xffffff,
    accent: 0xff6fbb,
    intensity: 1.35,
    gala: true,
  },
};

export const TIME_PRESETS = [
  { hour: 6.3, label: '黎明', en: 'DAWN' },
  { hour: 13.4, label: '正午', en: 'NOON' },
  { hour: 18.35, label: '黄昏', en: 'DUSK' },
  { hour: 20.2, label: '夜幕', en: 'NIGHT' },
];

export const PALETTE = [
  { name: '磨砂折面玻璃', en: 'FROSTED GLASS', hex: '#D6E0DC', note: '蚀刻 / 磨砂玻璃，几乎无镜面反射，只留柔和的漫射高光' },
  { name: '石材折面', en: 'STONE FACET', hex: '#C9C0AB', note: '外凸单元下部的暖灰石材三角面' },
  { name: 'PTFE 膜', en: 'MEMBRANE', hex: '#EEF0E9', note: '屋面内侧白色涂层玻璃纤维膜' },
  { name: '结构钢', en: 'STEEL', hex: '#252B2B', note: '深灰氟碳涂装，压住晶体轮廓' },
  { name: '看台座椅', en: 'SEATS', hex: '#98A6A6', note: '银灰为主，三层看台逐排渐亮' },
  { name: '塑胶跑道', en: 'TRACK', hex: '#A34E40', note: '砖红色九道 400 米田径场' },
  { name: '翡翠夜光', en: 'EMERALD', hex: '#56D9A4', note: '建筑师最初选择的夜间主色' },
];

export const STRUCTURE = [
  ['屋盖体系', '马鞍形单层折面空间网格结构，20 个结构单元沿看台轴线放射布置'],
  ['单元构成', '每个晶体单元以一枚外凸顶点为核，六条棱线向六边形轮廓放射，形成 6 块三角折面'],
  ['外凸折面', '顶点向外出挑约 14 m；相邻六边形在腰部共边相接，四块磨砂玻璃在上、两块石材在下'],
  ['看台体系', '三层椭圆看台；第三层仅沿两条长边展开，球门后方收于二层，二层顶端设 LED 大屏'],
  ['疏散组织', '20 条径向踏步通道贯通看台，每条双侧设扶手，层间以玻璃环带分隔'],
  ['最大悬挑', '68.4 m；屋盖中部开口 180 × 130 m'],
  ['结构高度', '最高点 51.3 m；折面结构厚度约 8.57—12 m'],
  ['钢材用量', '约 18,000 t，20 个球铰支座承担屋盖'],
  ['围护体系', '上部磨砂玻璃折面 + 下部石材折面 + 内层 PTFE 膜，双层表皮自然通风'],
];

export const TIMELINE = [
  ['2007.05', '深圳获得第 26 届世界大学生夏季运动会主办权'],
  ['2008.03', '大运中心“一场两馆”方案深化，gmp 与 sbp 合作'],
  ['2009.12', '主体育场钢结构合龙，20 个折面单元完成空间找形'],
  ['2011.03', '主体育场竣工，总建筑面积约 13.6 万 m²'],
  ['2011.08', '第 26 届世界大学生夏季运动会田径项目在此举行'],
  ['2023.03', '经改造后以“深圳大运中心体育场”重新开放'],
];

export const DRAWINGS = [
  {
    id: 'perspective',
    name: '透视图 · 外立面与看台',
    en: 'REFERENCE PERSPECTIVE',
    file: 'assets/drawings/perspective.jpg',
    note: '设计单位体育场剖透视参考图（用户提供）。可见 20 组外凸的晶体折面单元、下部石材色三角面、三层看台与中央场地的关系。',
    size: '2233 × 464',
    color: true,
  },
  {
    id: 'elevation-01',
    name: '主立面 · 峰谷展开',
    en: 'LONG ELEVATION',
    file: 'assets/drawings/elevation-01.jpg',
    note: '东西向长立面。连续三角折面构成峰谷交替的水晶轮廓，底部可见入口平台与集散广场。',
    size: '640 × 125',
  },
  {
    id: 'elevation-02',
    name: '主立面 · 网格',
    en: 'GRID ELEVATION',
    file: 'assets/drawings/elevation-02.jpg',
    note: '另一方向立面。可读出每个结构单元的斜向主杆件、次杆件与玻璃分格。',
    size: '640 × 129',
  },
  {
    id: 'elevation-03',
    name: '侧立面 · 折板',
    en: 'SIDE ELEVATION',
    file: 'assets/drawings/elevation-03.jpg',
    note: '折板从基座向上翻折，屋盖与立面连续。中段深色带对应入口与低区裙房。',
    size: '640 × 108',
  },
  {
    id: 'section',
    name: '横剖面 · 看台与屋盖',
    en: 'SECTION',
    file: 'assets/drawings/section.jpg',
    note: '剖面显示双层看台、中央包厢带、屋盖折面与内层膜结构的关系。',
    size: '640 × 133',
  },
  {
    id: 'plan-f1',
    name: 'F1 层平面',
    en: 'LEVEL 01',
    file: 'assets/drawings/plan-f1.jpg',
    note: '首层平面：椭圆基座、四向入口、环形集散厅、内场与田径跑道。',
    size: '640 × 609',
  },
  {
    id: 'plan-stands',
    name: '看台平面',
    en: 'SEATING PLAN',
    file: 'assets/drawings/plan-stands.jpg',
    note: '看台层平面：约 60,000 个座席沿椭圆环形排布，20 条径向疏散通道。',
    size: '640 × 699',
  },
  {
    id: 'plan-f2',
    name: 'F2 层平面',
    en: 'LEVEL 02',
    file: 'assets/drawings/plan-f2.jpg',
    note: '二层平面：环形休息厅、卫生间、餐饮与包厢服务空间。',
    size: '640 × 669',
  },
  {
    id: 'plan-f3',
    name: 'F3 层平面',
    en: 'LEVEL 03',
    file: 'assets/drawings/plan-f3.jpg',
    note: '三层平面：中层看台与贵宾环廊，外圈为设备与辅助房间。',
    size: '640 × 742',
  },
  {
    id: 'plan-f4',
    name: 'F4 层平面',
    en: 'LEVEL 04',
    file: 'assets/drawings/plan-f4.jpg',
    note: '四层平面：上层看台入口与环向集散空间。',
    size: '640 × 696',
  },
  {
    id: 'plan-f5',
    name: 'F5 层平面',
    en: 'LEVEL 05',
    file: 'assets/drawings/plan-f5.jpg',
    note: '五层平面：最高层看台、屋盖支撑与外围设备平台。',
    size: '640 × 737',
  },
  {
    id: 'plan-roof',
    name: '屋顶平面',
    en: 'ROOF PLAN',
    file: 'assets/drawings/plan-roof.jpg',
    note: '屋顶平面：180 × 130 米中央开口、折面网格与锯齿状外缘。',
    size: '640 × 763',
  },
];

export const SOURCES = [
  {
    n: '01',
    name: 'schlaich bergermann partner · Shenzhen Universiade Sports Center',
    detail: '结构设计、290 × 271 m 平面尺寸、折面结构说明',
    url: 'https://www.sbp.de/en/project/shenzhen-universiade-sports-center/',
  },
  {
    n: '02',
    name: 'ICON Magazine · Universiade Sports Centre by GMP Architekten',
    detail: '“水晶”概念、双层表皮、白昼灰绿与夜间发光效果',
    url: 'https://www.iconeye.com/architecture/universiade-sports-centre-by-gmp-architekten',
  },
  {
    n: '03',
    name: 'e-architect · Universiade Stadium in Shenzhen',
    detail: '项目背景、设计团队、建筑摄影与照明设计说明',
    url: 'https://www.e-architect.com/china/universiade-stadium-in-shenzhen',
  },
  {
    n: '04',
    name: '建筑结构学报 · 深圳大运中心体育场钢屋盖设计难点与分析',
    detail: '单层折面空间网格、68.4 m 最大悬挑、20 个球铰支座',
    url: 'https://wap.cnki.net/touch/web/Journal/Article/JZJB201105007.html',
  },
  {
    n: '05',
    name: '中建科工 · 深圳大运会主体育场钢结构胜利封顶',
    detail: '270 × 285 m 椭圆平面、51.3 m 最高点、18,000 t 用钢量',
    url: 'https://ccsic.cscec.com/zjgg/xwzx31/gskx31/201305/2712086.html',
  },
  {
    n: '06',
    name: '用户提供的建筑结构图纸与透视图',
    detail: '立面、剖面、F1—F5 层平面、看台平面、屋顶平面及建筑透视图，共 12 张',
    url: '',
  },
];

export const MATERIAL_NOTES = {
  daylight:
    '日光下，上部磨砂玻璃呈低饱和灰绿、只有柔和的漫射，几乎看不到镜面反射；下部石材折面呈暖灰。内层白色 PTFE 膜把直射光散射成柔和乳白，深灰钢结构勾出全部棱线。',
  night:
    '夜间照明藏在折面背后。磨砂玻璃被不均匀点亮时，外凸的六边形单元变成一组发光的晶体；绿色是建筑师最初的色彩主张。',
};
