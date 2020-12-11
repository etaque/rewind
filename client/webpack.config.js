const path = require("path");
const dist = path.resolve(__dirname, "dist");

const WebpackBar = require("webpackbar");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const WasmPackPlugin = require("@wasm-tool/wasm-pack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const mode = 'development';

module.exports = {
    entry: path.resolve(__dirname, 'src', 'index.ts'),
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename:'[name].[contenthash].js'
    },
    devServer: {
        contentBase: dist,
        // You can connect to dev server from devices in your network (e.g. 192.168.0.3:8000).
        host: "0.0.0.0",
        port: 3000,
        // Route everything to index to support SPA. It should be the same like `publicPath` above.
        historyApiFallback: {
            index: '/'
        },
        noInfo: true,
        stats: "errors-only",
        overlay: {
            // Commented to prevent error:
            // `./crate/pkg/index_bg.js 382:14-53   Critical dependency: the request of a dependency is an expression`
            // warnings: true,
            errors: true
        },
    },
    plugins: [
        // Show compilation progress bar in console.
        new WebpackBar(),
        // Clean `dist` folder before compilation.
        new CleanWebpackPlugin(),
        // Extract CSS styles into a file.
        new MiniCssExtractPlugin({
            filename:'[name].[contenthash].css'
        }),
        // Add scripts, css, ... to html template.
        new HtmlWebpackPlugin({
            template: path.resolve(__dirname, "src/index.html")
        }),
        // Compile Rust.
        new WasmPackPlugin({
            crateDirectory: __dirname
        })
    ],
    // Webpack try to guess how to resolve imports in this order:
    resolve: {
      extensions: [".ts", ".js", ".wasm"],
      alias: {
        crate: __dirname
      }
    },
    
    module: {
      rules: [
        {
          test: /\.ts$/,
          loader: "ts-loader?configFile=tsconfig.json"
        },
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            "css-loader",
            {
              loader: "postcss-loader",
              options: {
                config: {
                  // Path to postcss.config.js.
                  path: __dirname,
                  // Pass mode into `postcss.config.js` (see more info in that file).
                  ctx: { mode }
                }
              }
            }
          ]
        }
      ]
    },
    mode
};
