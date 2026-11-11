<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type CSSProperties } from 'vue'

/**
 * ==================== 游戏常量 ====================
 */
const GRID_SIZE = 4 // 网格边长（4 x 4）
const CELL_COUNT = GRID_SIZE * GRID_SIZE // 格子总数：16

const DEFAULT_DURATION = 30 // 默认单局时长（秒）
const MIN_DURATION = 1 // 单局时长下限（秒）
const MAX_DURATION = 600 // 单局时长上限（秒）

const MOLE_VISIBLE_MS = 900 // 地鼠单次显示时长（毫秒）
const MIN_APPEAR_MS = 1000 // 地鼠出现的最短间隔（毫秒）
const MAX_APPEAR_MS = 2000 // 地鼠出现的最长间隔（毫秒）

const LEADERBOARD_MAX = 5 // 排行榜保留的条目数
const LEADERBOARD_KEY = 'whack-a-mole-leaderboard' // 本地存储键名

/** 地鼠种类：不同分数与外观 */
interface MoleType {
  score: number
  emoji: string
  label: string
  color: string
}

/** 三种地鼠：分别对应 1 分、2 分、5 分 */
const MOLE_TYPES: MoleType[] = [
  { score: 1, emoji: '🐹', label: '普通地鼠', color: '#636e72' },
  { score: 2, emoji: '🐿️', label: '稀有地鼠', color: '#e17055' },
  { score: 5, emoji: '🦊', label: '黄金地鼠', color: '#f39c12' },
]

/** 排行榜条目 */
interface LeaderboardEntry {
  name: string
  score: number
}

/**
 * ==================== 响应式状态 ====================
 */
const score = ref(0) // 当前得分
const timeLeft = ref(DEFAULT_DURATION) // 剩余时间（秒）
const moleIndex = ref(-1) // 当前地鼠所在格子的下标，-1 表示没有地鼠
const moleType = ref<MoleType | null>(null) // 当前出现的地鼠种类
const running = ref(false) // 游戏是否进行中
const started = ref(false) // 是否开始过游戏（用于切换按钮文案）
const duration = ref<number>(DEFAULT_DURATION) // 用户自定义的单局时长（秒）

// 排行榜与结算相关状态
const leaderboard = ref<LeaderboardEntry[]>(loadLeaderboard())
const showNameInput = ref(false) // 是否显示「输入名字」结算框
const playerName = ref('') // 结算时输入的名字
const pendingScore = ref(0) // 待上榜的本次得分
const highlightedIndex = ref(-1) // 刚上榜条目在排行榜中的下标，用于高亮

/**
 * ==================== 定时器句柄 ====================
 */
let countdownTimer: number | undefined // 倒计时定时器
let appearTimer: number | undefined // 地鼠出现定时器
let hideTimer: number | undefined // 地鼠自动隐藏定时器

// 上一次地鼠出现的格子下标，避免连续两次出现在同一格
let lastMoleIndex = -1

/**
 * ==================== 计算属性 ====================
 */

// 游戏是否已结束（时间归零且不在运行中）
const isGameOver = computed(() => started.value && !running.value && timeLeft.value === 0)

// 按钮文案：未开始过显示「开始游戏」，否则显示「重新开始」
const buttonText = computed(() => (started.value ? '重新开始' : '开始游戏'))

// 剩余时间过少时用于高亮提示
const isTimeCritical = computed(() => running.value && timeLeft.value <= 5)

// 结算文案
const resultText = computed(() => {
  if (!isGameOver.value) return ''
  if (showNameInput.value) {
    return `🎉 时间到！本局得分：${score.value}，你进入了历史前 ${LEADERBOARD_MAX} 名！`
  }
  return `⏰ 时间到！本局得分：${score.value}`
})

/**
 * ==================== 工具函数 ====================
 */

/** 生成 [min, max] 区间内的随机整数 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 随机选择一个格子下标，并避免与上一次相同 */
function randomCell(): number {
  let cell: number
  do {
    cell = randomInt(0, CELL_COUNT - 1)
  } while (cell === lastMoleIndex && CELL_COUNT > 1)
  lastMoleIndex = cell
  return cell
}

/** 从三种地鼠中随机选择一种 */
function randomMoleType(): MoleType {
  return MOLE_TYPES[randomInt(0, MOLE_TYPES.length - 1)]
}

/** 把时长限制在合理范围内，非法值回退到默认值 */
function clampDuration(value: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return DEFAULT_DURATION
  return Math.min(Math.max(Math.round(value), MIN_DURATION), MAX_DURATION)
}

/** 清除所有定时器，避免上一局残留的定时器影响后续流程 */
function clearTimers(): void {
  if (countdownTimer !== undefined) {
    window.clearInterval(countdownTimer)
    countdownTimer = undefined
  }
  if (appearTimer !== undefined) {
    window.clearTimeout(appearTimer)
    appearTimer = undefined
  }
  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer)
    hideTimer = undefined
  }
}

/**
 * ==================== 排行榜持久化 ====================
 */

/** 校验一个值是否为合法的排行榜条目 */
function isValidEntry(value: unknown): value is LeaderboardEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LeaderboardEntry).name === 'string' &&
    typeof (value as LeaderboardEntry).score === 'number' &&
    Number.isFinite((value as LeaderboardEntry).score)
  )
}

/** 从 localStorage 读取历史排行榜，按分数降序并截取前 N 名 */
function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = window.localStorage.getItem(LEADERBOARD_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isValidEntry)
      .sort((a, b) => b.score - a.score)
      .slice(0, LEADERBOARD_MAX)
  } catch {
    return []
  }
}

/** 将当前排行榜写入 localStorage */
function saveLeaderboard(): void {
  try {
    window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard.value))
  } catch {
    // 本地存储不可用时静默失败，不影响游戏本身
  }
}

/**
 * ==================== 游戏核心逻辑 ====================
 */

/** 开始（或重新开始）一局游戏 */
function startGame(): void {
  clearTimers() // 先清理上一局遗留的定时器
  score.value = 0
  timeLeft.value = clampDuration(duration.value)
  moleIndex.value = -1
  moleType.value = null
  lastMoleIndex = -1
  started.value = true
  running.value = true

  // 重置结算相关状态
  showNameInput.value = false
  playerName.value = ''
  pendingScore.value = 0
  highlightedIndex.value = -1

  // 启动每秒一次的倒计时
  countdownTimer = window.setInterval(tick, 1000)
  // 安排第一只地鼠出现
  scheduleMole()
}

/** 倒计时：每秒减 1，归零时结束游戏 */
function tick(): void {
  timeLeft.value -= 1
  if (timeLeft.value <= 0) {
    endGame()
  }
}

/** 结束游戏：停止所有定时器、隐藏地鼠，并检查是否上榜 */
function endGame(): void {
  clearTimers()
  running.value = false
  moleIndex.value = -1
  moleType.value = null
  checkLeaderboard()
}

/** 在随机 1～2 秒后让一只地鼠出现 */
function scheduleMole(): void {
  if (!running.value) return
  const delay = randomInt(MIN_APPEAR_MS, MAX_APPEAR_MS)
  appearTimer = window.setTimeout(showMole, delay)
}

/** 让一只随机种类的地鼠出现在随机格子中，并在 MOLE_VISIBLE_MS 毫秒后自动隐藏 */
function showMole(): void {
  if (!running.value) return
  moleIndex.value = randomCell()
  moleType.value = randomMoleType()
  // 地鼠超时未被打中则自动隐藏，并安排下一只
  hideTimer = window.setTimeout(() => {
    moleIndex.value = -1
    moleType.value = null
    scheduleMole()
  }, MOLE_VISIBLE_MS)
}

/** 玩家点击格子：命中地鼠则按种类计分，并立即安排下一只 */
function whack(index: number): void {
  // 仅当游戏进行中且点中的正是地鼠所在格子时才计分
  if (!running.value || index !== moleIndex.value) return

  const type = moleType.value
  score.value += type ? type.score : 0
  moleIndex.value = -1
  moleType.value = null

  // 命中后取消本次的自动隐藏，避免重复安排下一只
  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer)
    hideTimer = undefined
  }
  scheduleMole()
}

/** 游戏结束后判断本次得分是否进入历史前 N 名 */
function checkLeaderboard(): void {
  const finalScore = score.value
  const lowestScore =
    leaderboard.value.length >= LEADERBOARD_MAX
      ? leaderboard.value[leaderboard.value.length - 1].score
      : -1

  const qualifies =
    finalScore > 0 &&
    (leaderboard.value.length < LEADERBOARD_MAX || finalScore > lowestScore)

  if (qualifies) {
    pendingScore.value = finalScore
    showNameInput.value = true
  } else {
    pendingScore.value = 0
    showNameInput.value = false
  }
}

/** 确认上榜：插入本次得分并持久化 */
function confirmScore(): void {
  const name = playerName.value.trim() || '匿名'
  const entry: LeaderboardEntry = { name, score: pendingScore.value }

  leaderboard.value = [...leaderboard.value, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, LEADERBOARD_MAX)
  saveLeaderboard()

  highlightedIndex.value = leaderboard.value.indexOf(entry)
  showNameInput.value = false
  playerName.value = ''
}

/** 跳过上榜 */
function skipScore(): void {
  showNameInput.value = false
  playerName.value = ''
  pendingScore.value = 0
}

/** 时长输入框失焦 / 回车时，把时长限制在合法范围内 */
function onDurationChange(): void {
  duration.value = clampDuration(duration.value)
}

/** 返回某个格子的内联样式：命中地鼠时按其种类着色 */
function cellStyle(index: number): CSSProperties {
  if (index === moleIndex.value && moleType.value) {
    return {
      borderColor: moleType.value.color,
      background: `${moleType.value.color}22`,
    }
  }
  return {}
}

// 组件卸载前清理定时器，防止内存泄漏
onBeforeUnmount(clearTimers)
</script>

<template>
  <div class="game">
    <!-- 标题 -->
    <h1 class="game__title">🔨 打地鼠</h1>

    <!-- 每局时长设置 -->
    <div class="game__settings">
      <label class="game__setting">
        <span class="game__setting-label">每局时长</span>
        <input
          v-model.number="duration"
          class="game__setting-input"
          type="number"
          :min="MIN_DURATION"
          :max="MAX_DURATION"
          :disabled="running"
          aria-label="每局时长（秒）"
          @change="onDurationChange"
        />
        <span class="game__setting-unit">秒</span>
      </label>
    </div>

    <!-- 信息面板：得分与倒计时 -->
    <div class="game__panel">
      <div class="game__stat">
        <span class="game__stat-label">得分</span>
        <span class="game__stat-value">{{ score }}</span>
      </div>
      <div class="game__stat">
        <span class="game__stat-label">剩余时间</span>
        <span class="game__stat-value" :class="{ 'game__stat-value--warning': isTimeCritical }">
          {{ timeLeft }} 秒
        </span>
      </div>
    </div>

    <!-- 开始 / 重新开始按钮 -->
    <button class="game__button" type="button" @click="startGame">
      {{ buttonText }}
    </button>

    <!-- 地鼠种类图例 -->
    <div class="legend">
      <span v-for="type in MOLE_TYPES" :key="type.score" class="legend__item">
        <span class="legend__emoji">{{ type.emoji }}</span>
        <span class="legend__text">{{ type.label }}</span>
        <span class="legend__score" :style="{ background: type.color }">+{{ type.score }}</span>
      </span>
    </div>

    <!-- 4x4 游戏网格 -->
    <div class="grid">
      <button
        v-for="n in CELL_COUNT"
        :key="n"
        type="button"
        class="grid__cell"
        :class="{ 'grid__cell--active': n - 1 === moleIndex }"
        :style="cellStyle(n - 1)"
        @click="whack(n - 1)"
      >
        <!-- 地鼠及其分值，仅当该格是当前地鼠所在格时显示 -->
        <span v-if="n - 1 === moleIndex && moleType" class="grid__mole">
          <span class="grid__mole-emoji">{{ moleType.emoji }}</span>
          <span class="grid__mole-score" :style="{ background: moleType.color }">
            +{{ moleType.score }}
          </span>
        </span>
      </button>
    </div>

    <!-- 结束提示 -->
    <p v-if="isGameOver" class="game__result">{{ resultText }}</p>

    <!-- 上榜输入名字 -->
    <div v-if="isGameOver && showNameInput" class="name-form">
      <p class="name-form__title">🏆 恭喜上榜！请输入你的名字：</p>
      <div class="name-form__row">
        <input
          v-model="playerName"
          class="name-form__input"
          type="text"
          maxlength="20"
          placeholder="请输入名字"
          autofocus
          @keyup.enter="confirmScore"
        />
        <button class="name-form__button name-form__button--primary" type="button" @click="confirmScore">
          保存
        </button>
        <button class="name-form__button" type="button" @click="skipScore">跳过</button>
      </div>
    </div>

    <!-- 开始引导 -->
    <p v-if="!started" class="game__hint">点击上方「{{ buttonText }}」按钮开始游戏</p>

    <!-- 排行榜 -->
    <section class="leaderboard">
      <h2 class="leaderboard__title">🏆 排行榜（前 {{ LEADERBOARD_MAX }} 名）</h2>
      <ol v-if="leaderboard.length" class="leaderboard__list">
        <li
          v-for="(entry, i) in leaderboard"
          :key="i"
          class="leaderboard__item"
          :class="{ 'leaderboard__item--highlight': i === highlightedIndex }"
        >
          <span class="leaderboard__rank">{{ i + 1 }}</span>
          <span class="leaderboard__name">{{ entry.name }}</span>
          <span class="leaderboard__score">{{ entry.score }} 分</span>
        </li>
      </ol>
      <p v-else class="leaderboard__empty">暂无记录，快来挑战吧！</p>
    </section>
  </div>
</template>

<style scoped>
/* ===== 游戏容器：卡片式布局 ===== */
.game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 32px;
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  max-width: 460px;
  width: 100%;
}

.game__title {
  font-size: 2rem;
  color: #6c5ce7;
  letter-spacing: 2px;
}

/* ===== 每局时长设置 ===== */
.game__settings {
  width: 100%;
  display: flex;
  justify-content: center;
}

.game__setting {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: #f8f9fa;
  border-radius: 12px;
}

.game__setting-label {
  font-size: 0.9rem;
  color: #636e72;
}

.game__setting-input {
  width: 72px;
  padding: 6px 10px;
  font-size: 1rem;
  text-align: center;
  color: #2d3436;
  border: 2px solid #dfe6e9;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.15s ease;
}

.game__setting-input:focus {
  border-color: #6c5ce7;
}

.game__setting-input:disabled {
  background: #f1f2f6;
  color: #b2bec3;
  cursor: not-allowed;
}

.game__setting-unit {
  font-size: 0.9rem;
  color: #636e72;
}

/* ===== 信息面板 ===== */
.game__panel {
  display: flex;
  gap: 24px;
  width: 100%;
  justify-content: center;
}

.game__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 90px;
  padding: 10px 16px;
  background: #f8f9fa;
  border-radius: 12px;
}

.game__stat-label {
  font-size: 0.85rem;
  color: #636e72;
}

.game__stat-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: #2d3436;
}

.game__stat-value--warning {
  color: #d63031;
}

/* ===== 开始 / 重新开始按钮 ===== */
.game__button {
  padding: 12px 40px;
  font-size: 1.1rem;
  font-weight: 600;
  color: #ffffff;
  background: #6c5ce7;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}

.game__button:hover {
  background: #5a4bd1;
}

.game__button:active {
  transform: scale(0.96);
}

/* ===== 地鼠种类图例 ===== */
.legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 16px;
}

.legend__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: #636e72;
}

.legend__emoji {
  font-size: 1.1rem;
}

.legend__score {
  font-size: 0.7rem;
  font-weight: 700;
  color: #ffffff;
  padding: 1px 7px;
  border-radius: 999px;
  line-height: 1.5;
}

/* ===== 4x4 游戏网格 ===== */
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  width: 100%;
}

.grid__cell {
  position: relative;
  aspect-ratio: 1;
  background: #dfe6e9;
  border: 2px solid #b2bec3;
  border-radius: 12px;
  cursor: pointer;
  overflow: hidden;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.grid__cell:hover {
  background: #cfd8dc;
}

/* 地鼠所在的格子高亮显示（默认底色，会被内联样式按种类覆盖） */
.grid__cell--active {
  background: #ffeaa7;
  border-color: #fdcb6e;
}

/* ===== 地鼠样式：出现时带有弹跳动画 ===== */
.grid__mole {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  animation: pop 0.15s ease-out;
}

.grid__mole-emoji {
  font-size: 2.2rem;
  line-height: 1;
}

.grid__mole-score {
  font-size: 0.75rem;
  font-weight: 700;
  color: #ffffff;
  padding: 1px 8px;
  border-radius: 999px;
  line-height: 1.4;
}

@keyframes pop {
  from {
    transform: translateY(60%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* ===== 结果与提示 ===== */
.game__result {
  font-size: 1.15rem;
  font-weight: 600;
  color: #d63031;
}

.game__hint {
  font-size: 0.95rem;
  color: #636e72;
}

/* ===== 上榜输入名字 ===== */
.name-form {
  width: 100%;
  padding: 16px;
  background: #fff7e6;
  border: 2px solid #fdcb6e;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.name-form__title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #e17055;
  text-align: center;
}

.name-form__row {
  display: flex;
  gap: 8px;
}

.name-form__input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  font-size: 0.95rem;
  border: 2px solid #dfe6e9;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.15s ease;
}

.name-form__input:focus {
  border-color: #f39c12;
}

.name-form__button {
  padding: 8px 14px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #2d3436;
  background: #dfe6e9;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.name-form__button:hover {
  background: #cfd8dc;
}

.name-form__button--primary {
  color: #ffffff;
  background: #f39c12;
}

.name-form__button--primary:hover {
  background: #e08e0b;
}

/* ===== 排行榜 ===== */
.leaderboard {
  width: 100%;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 12px;
}

.leaderboard__title {
  font-size: 1rem;
  color: #2d3436;
  text-align: center;
  margin-bottom: 10px;
}

.leaderboard__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.leaderboard__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  background: #ffffff;
  border-radius: 8px;
  font-size: 0.9rem;
}

.leaderboard__item--highlight {
  background: #ffeaa7;
  outline: 2px solid #f39c12;
}

.leaderboard__rank {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  color: #ffffff;
  background: #6c5ce7;
  border-radius: 50%;
}

.leaderboard__item:nth-child(1) .leaderboard__rank {
  background: #f39c12;
}

.leaderboard__item:nth-child(2) .leaderboard__rank {
  background: #a0a0a0;
}

.leaderboard__item:nth-child(3) .leaderboard__rank {
  background: #cd7f32;
}

.leaderboard__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #2d3436;
}

.leaderboard__score {
  font-weight: 700;
  color: #6c5ce7;
}

.leaderboard__empty {
  text-align: center;
  font-size: 0.9rem;
  color: #b2bec3;
  padding: 8px 0;
}
</style>
