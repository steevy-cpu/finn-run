<template>
  <div class="score_container">
      <div class="score_panel">
          <div class="stat">
              <span class="stat-label">Score</span>
              <span class="stat-value">{{ score }}</span>
          </div>
          <div class="stat">
              <span class="stat-label">Coins</span>
              <span class="stat-value">{{ coin }}</span>
          </div>
          <div class="stat">
              <span class="stat-label">Mistakes</span>
              <span class="stat-value" :class="{ danger: mistake > 0 }">{{ mistake }}</span>
          </div>
      </div>
  </div>
</template>

<script setup lang="ts">
import {defineProps} from 'vue';
const props = defineProps({
  score: {type: Number, default: 0},
  coin: {type: Number, default: 0},
  mistake: {type: Number, default: 0},
});
</script>

<style scoped>
.score_container {
  width: 50vw; /* stay inside the game pane */
  height: 100vh;
  position: relative;
  z-index: 999;
  pointer-events: none;
}

.score_panel {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 26px;
  padding: 10px 20px;
  background: rgba(17, 20, 24, 0.82);
  color: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 58px;
}

.stat-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #9aa0a6;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.stat-value.danger {
  color: #ff5252;
}
</style>
