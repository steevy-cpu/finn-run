import './assets/main.less'
import './assets/phase4.css'
import './assets/finn-presentation.css'
import './assets/intro-overrides.css'

import { createApp } from 'vue'

import App from './App.vue'
import { UI_MODE } from '@/Game/envart'

// Phase 4 redesign is opt-in (?ui=phase4); the attribute scopes its styles.
document.documentElement.dataset.ui = UI_MODE;

createApp(App).mount('#app')
