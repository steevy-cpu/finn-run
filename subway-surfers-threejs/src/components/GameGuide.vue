<template>
  <div v-if="showMask" class="game-mask">
      <div class="p4 game-brand">
          <div class="game-title">FINN RUN</div>
          <div class="game-tagline">Your moves. Finn runs.</div>
      </div>
      <div class="message">Press <span class="key">{{ textCompute.key }}</span> {{ textCompute.text }}</div>
  </div>
</template>

<script setup lang="ts">
import {defineProps, computed} from 'vue';
const props = defineProps({
  showMask: {type: Boolean, default: false},
  gameStatus: {type: String, default: 'ready'},
});
const keyMap: Record<string, any> = {
  ready: {
      key: 'P',
      text: 'or New Game (right panel) to play',
  },
  end: {
      key: 'R',
      text: 'or New Game (right panel) to play again',
  },
};
const textCompute = computed(() => {
  return keyMap[props.gameStatus];
});
</script>

<style scoped>
.game-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: var(--split, 50vw); /* cover only the game pane */
  height: 100%;
  background-color: rgba(0, 0, 0, .6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
}

.message {
  font-size: 24px;
  color: white;
  text-align: center;
}

.p4 {
  display: none;
}

.key {
  background-color: #3498db;
  color: white;
  padding: 5px 10px;
  border-radius: 5px;
}
</style>
