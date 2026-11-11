<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

/**
 * ==================== 游戏常量 ====================
 */
const GRID_SIZE = 4 // 网格边长（4 x 4）
const CELL_COUNT = GRID_SIZE * GRID_SIZE // 格子总数：16
const GAME_DURATION = 30 // 单局时长（秒）
const MOLE_VISIBLE_MS = 900 // 地鼠单次显示时长（毫秒）
const MIN_APPEAR_MS = 1000 // 地鼠出现的最短间隔（毫秒）
const MAX_APPEAR_MS = 2000 // 地鼠出现的最长间隔（毫秒）

/**
 * ==================== 响应式状态 ====================
 */
const score = ref(0) // 当前得分
const timeLeft = ref(GAME_DURATION) // 剩余时间（秒）
const moleIndex = ref(-1) // 当前地鼠所在格子的下标，-1 表示没有地鼠
const running = ref(false) // 游戏是否进行中
const started = ref(false) // 是否开始过游戏（用于切换按钮文案）

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
 * ==================== 游戏核心逻辑 ====================
 */

/** 开始（或重新开始）一局游戏 */
function startGame(): void {
  clearTimers() // 先清理上一局遗留的定时器
  score.value = 0
  timeLeft.value = GAME_DURATION
  moleIndex.value = -1
  lastMoleIndex = -1
  started.value = true
  running.value = true

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

/** 结束游戏：停止所有定时器并隐藏地鼠 */
function endGame(): void {
  clearTimers()
  running.value = false
  moleIndex.value = -1
}

/** 在随机 1～2 秒后让一只地鼠出现 */
function scheduleMole(): void {
  if (!running.value) return
  const delay = randomInt(MIN_APPEAR_MS, MAX_APPEAR_MS)
  appearTimer = window.setTimeout(showMole, delay)
}

/** 让地鼠出现在随机格子中，并在 MOLE_VISIBLE_MS 毫秒后自动隐藏 */
function showMole(): void {
  if (!running.value) return
  moleIndex.value = randomCell()
  // 地鼠超时未被打中则自动隐藏，并安排下一只
  hideTimer = window.setTimeout(() => {
    moleIndex.value = -1
    scheduleMole()
  }, MOLE_VISIBLE_MS)
}

/** 玩家点击格子：命中地鼠则得分，并立即安排下一只 */
function whack(index: number): void {
  // 仅当游戏进行中且点中的正是地鼠所在格子时才计分
  if (!running.value || index !== moleIndex.value) return

  score.value += 1
  moleIndex.value = -1

  // 命中后取消本次的自动隐藏，避免重复安排下一只
  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer)
    hideTimer = undefined
  }
  scheduleMole()
}

// 组件卸载前清理定时器，防止内存泄漏
onBeforeUnmount(clearTimers)
</script>

<template>
  <div class="game">
    <!-- 标题 -->
    <h1 class="game__title">🔨 打地鼠</h1>

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

    <!-- 4x4 游戏网格 -->
    <div class="grid">
      <button
        v-for="n in CELL_COUNT"
        :key="n"
        type="button"
        class="grid__cell"
        :class="{ 'grid__cell--active': n - 1 === moleIndex }"
        @click="whack(n - 1)"
      >
        <!-- 地鼠表情，仅当该格是当前地鼠所在格时显示 -->
        <span v-if="n - 1 === moleIndex" class="grid__mole">🐹</span>
      </button>
    </div>

    <!-- 结束提示 / 开始引导 -->
    <p v-if="isGameOver" class="game__result">⏰ 时间到！本局得分：{{ score }}</p>
    <p v-else-if="!running" class="game__hint">点击上方「{{ buttonText }}」按钮开始游戏</p>
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
  transition: background 0.15s ease;
}

.grid__cell:hover {
  background: #cfd8dc;
}

/* 地鼠所在的格子高亮显示 */
.grid__cell--active {
  background: #ffeaa7;
  border-color: #fdcb6e;
}

/* ===== 地鼠样式：出现时带有弹跳动画 ===== */
.grid__mole {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.4rem;
  animation: pop 0.15s ease-out;
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
</style>
