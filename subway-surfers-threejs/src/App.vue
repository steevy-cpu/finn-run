<template>
  <div>
    <div v-if="!isReady" class="loading">
      <div class="p4 loading-brand">FINN RUN</div>
      <div class="loading-anima aaa">
        <div></div>
        <div></div>
        <div></div>
      </div>
      <div class="frp-loading-label">Loading asset: {{ loadingData.url }}</div>
      <div class="frp-loading-label">Loaded {{ loadingData.itemsLoaded || 0 }}/{{ loadingData.itemsTotal || 0 }}</div>
      <div v-if="loadingData.type === 'successLoad'">Loaded — one moment</div>
    </div>
    <GameGuide :show-mask="isReady && showGuide" :game-status="gameStatus" />
    <ScorePanel :score="score" :coin="coin" :mistake="mistake" />
    <div class="experience">
      <canvas ref="exp_canvas" class="experience__canvas"></canvas>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, computed, onUnmounted } from 'vue';
import ScorePanel from './components/ScorePanel.vue';
import GameGuide from './components/GameGuide.vue';
import Game from './Game';
// 模型是否加载完成
const isReady = ref(false);
// 比赛分数
const score = ref(0);
// 比赛金币
const coin = ref(0);
// 比赛小失误数量
const mistake = ref(0);
// 比赛的状态
const gameStatus = ref('ready');

let loadingData: any = ref({});
const exp_canvas = ref<HTMLElement>();
const showGuide = computed(() => {
  return gameStatus.value !== 'start';
});

onMounted(() => {
  const game = new Game(exp_canvas.value);
  // CV control layer (webcam pose → game input); loaded after Game exists.
  import('@/cv');
  // 资源加载
  game.on('progress', (data: any) => {
    const { type } = data;
    if (type === 'successLoad') {
      loadingData.value.type = 'successLoad';
      isReady.value = true;
    }
    else {
      loadingData.value = data;
    }
  });
  game.on('gameStatus', (data: any) => {
    console.log(data);
    gameStatus.value = data;
  });
  game.on('gameData', (data: any) => {
    score.value = data.score;
    coin.value = data.coin;
    mistake.value = data.mistake;
  });
});
onUnmounted(() => {
  (window as any).__cvIntro?.dispose?.(); // welcome screen owned by the cv layer
  const game = new Game(exp_canvas.value);
  game?.disposeGame();
});
</script>

<style scoped>
.p4 {
  display: none;
}

.loading {
  position: fixed;
  height: 100vh;
  width: 100vw;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  z-index: 999;
  background-color: #fff;
}

.loading-anima,
.loading-anima>div {
  position: relative;
  box-sizing: border-box;
}

.aaa {
  display: block;
  font-size: 0;
  color: white;
}

.loading-anima.la-dark {
  color: #333;
}

.loading-anima>div {
  display: inline-block;
  float: none;
  background-color: black;
  border: 0 solid black;
}

.loading-anima {
  width: 54px;
  height: 18px;
}

.aaa>div {
  width: 10px;
  height: 10px;
  margin: 4px;
  border-radius: 100%;
  animation: ball-pulse-sync .6s infinite ease-in-out;
}

.loading-anima>div:nth-child(1) {
  animation-delay: -.14s;
}

.loading-anima>div:nth-child(2) {
  animation-delay: -.07s;
}

.loading-anima>div:nth-child(3) {
  animation-delay: 0s;
}

.loading-anima.la-sm {
  width: 26px;
  height: 8px;
}

.loading-anima.la-sm>div {
  width: 4px;
  height: 4px;
  margin: 2px;
}

.loading-anima.la-2x {
  width: 108px;
  height: 36px;
}

.loading-anima.la-2x>div {
  width: 20px;
  height: 20px;
  margin: 8px;
}

.loading-anima.la-3x {
  width: 162px;
  height: 54px;
}

.loading-anima.la-3x>div {
  width: 30px;
  height: 30px;
  margin: 12px;
}

@keyframes ball-pulse-sync {
  33% {
    transform: translateY(100%);
  }

  66% {
    transform: translateY(-100%);
  }

  100% {
    transform: translateY(0);
  }
}

/* Split screen: game fills the left half; the CV feed (right half) is
   rendered by the cv layer's #cv-panel. */
.experience {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: 50vw;
  overflow: hidden;
}

.experience__canvas {
  display: block;
  height: 100%;
  width: 100%;
}
</style>
./Game/init./Game