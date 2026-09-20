import { createApp } from "vue";
import App from "./App.vue";
import { createPinia } from "pinia";
import "./app/styles.css";
import "./app/desktop.css";
import "./app/tailwind.css";

createApp(App).use(createPinia()).mount("#app");
