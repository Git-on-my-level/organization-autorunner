import adapterAuto from "@sveltejs/adapter-auto";
import adapterNode from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const useNodeAdapter = process.env.ADAPTER === "node";

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: useNodeAdapter ? adapterNode({ out: "build" }) : adapterAuto(),
  },
};

export default config;
