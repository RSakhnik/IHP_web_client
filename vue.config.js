const { defineConfig } = require("@vue/cli-service");

const ModuleFederationPlugin = require("webpack/lib/container/ModuleFederationPlugin");
const CopyPlugin = require("copy-webpack-plugin");

const isProduction = process.env.NODE_ENV === "production";

module.exports = defineConfig({
  transpileDependencies: true,
  publicPath: "auto",
  outputDir: isProduction ? "./dist/frontend" : undefined,
  lintOnSave: false,
  chainWebpack: config => {
    config.module.rules.delete('eslint');
  },
  configureWebpack: () => {
    return {
      entry: {
        main: './src/main.ts',
      },
      output: {
        uniqueName: "ai_extension",
        scriptType: "text/javascript",
        filename: "[name].js",
        clean: true,
      },
      optimization: {
        runtimeChunk: false,
        splitChunks: isProduction ? undefined : false,
      },
      plugins: [
        new ModuleFederationPlugin({
          name: "ai_extension",
          library: {
            type: "var",
            name: "ai_extension",
          },
          filename: "[name].js",
          exposes: {
            "ITabs<BimRightPanelContext>": "./src/extension/aiExtension.ts",
            "IOpenspaceView<BimRightPanelContext>": "./src/extension/aiExtension.ts",
          },
          shared: {
            "@pilotdev/pilot-web-sdk": { singleton: true },
            "@pilotdev/pilot-web-3d": { singleton: true},
            "@supabase/supabase-js": { singleton: true},
          },
        }),
        new CopyPlugin({
          patterns: [
            {
              from: "./src/extension/extensions.config.json",
              to: `extensions.config.json`,
            },
          ],
        }),
      ],
      devServer: {
        port: 4300,
        headers: {
          'Access-Control-Allow-Origin': '*', 
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization'
        },
        proxy: {
      '/api/llm': {
        target: 'https://uspilot.ru:5546',
        changeOrigin: true,
        secure: false,
        pathRewrite: {
          '^/api/llm': '/llm'
        },
        onProxyReq: (proxyReq, req, res) => {
          console.log('Proxying request to:', proxyReq.path);
        },
        onError: (err, req, res) => {
          console.error('Proxy error:', err);
        }
      }
    }
      },
    };
  },
});