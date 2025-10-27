import './app.css'
import App from './App.svelte'

// Svelte 5 uses the mount API instead of new Component()
import { mount } from 'svelte'

const app = mount(App, {
  target: document.getElementById('app')
})

export default app