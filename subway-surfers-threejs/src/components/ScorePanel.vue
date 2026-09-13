<template>
  <div class="score_container">
      <div class="score_panel">
          <div class="stat">
              <span class="stat-label">Score</span>
              <span class="stat-value">{{ score }}</span>
          </div>
          <div class="stat stat-coins">
              <span class="stat-label">Coins</span>
              <span class="stat-value"><svg class="p4 hud-coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#FFD45A" stroke="#B8860B" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="none" stroke="#B8860B" stroke-width="1.5"/></svg>{{ coin }}</span>
          </div>
          <div class="stat stat-mistakes">
              <span class="stat-label">Mistakes</span>
              <span class="stat-value" :class="{ danger: mistake > 0 }">{{ mistake }}<span class="p4 hud-pips" aria-hidden="true"><i v-for="n in MAX_MISTAKES" :key="n" :class="{ hit: mistake >= n }"></i></span></span>
          </div>
      </div>
  </div>
</template>

<script setup lang="ts">
import {defineProps} from 'vue';
// The run ends at the second mistake (ControlPlayer.checkGameStatus), so
// the HUD shows two pips against that real limit.
const MAX_MISTAKES = 2;
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

/* Phase 4-only decorations: revealed by assets/phase4.css when
   <html data-ui="phase4">; invisible in the original UI. */
.p4 {
  display: none;
}
</style>
