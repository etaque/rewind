const path = require("path");
const dist = path.resolve(__dirname, "dist");

const WebpackBar = require("webpackbar");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const Dotenv = require("dotenv-webpack");

const mode = "development";

const baseConfig = {
  devtool: "source-map",
  externals: {
    three: "THREE",
  },
  // Webpack try to guess how to resolve imports in this order:
  resolve: {
    extensions: [".ts", ".js", ".elm"],
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "ts-loader?configFile=tsconfig.json",
      },
      {
        test: /\.elm$/,
        exclude: [/elm-stuff/, /node_modules/],
        loader: "elm-webpack-loader?debug=false",
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
                ctx: { mode },
              },
            },
          },
        ],
      },
    ],
  },
  mode,
};

const mainConfig = {
  name: "Main",
  entry: path.resolve(__dirname, "src", "index.ts"),
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "index.[hash].js",
  },
  devServer: {
    inline: true,
    // hot: true,
    contentBase: dist,
    host: "0.0.0.0",
    port: 3000,
    // Route everything to index to support SPA. It should be the same like `publicPath` above.
    historyApiFallback: {
      index: "/",
    },
    noInfo: true,
    stats: "errors-only",
    overlay: {
      errors: true,
    },
  },
  plugins: [
    new Dotenv({ path: "../.env", expand: true }),
    // Show compilation progress bar in console.
    new WebpackBar(),
    // Clean `dist` folder before compilation.
    new CleanWebpackPlugin(),
    // Extract CSS styles into a file.
    new MiniCssExtractPlugin({
      filename: "[name].[contenthash].css",
    }),
    // Add scripts, css, ... to html template.
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "src/index.html"),
    }),
    new CopyWebpackPlugin({
      patterns: [
        require.resolve("three/build/three.min.js"),
        {
          from: path.resolve(
            require.resolve("@here/harp-map-theme"),
            "..",
            "resources"
          ),
          to: "resources/",
          toType: "dir",
        },
      ],
    }),
  ],
  ...baseConfig,
};

const workerConfig = {
  name: "Harp Decoder",
  entry: path.resolve(__dirname, "src", "map-worker", "index.js"),
  target: "webworker",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "decoder.bundle.js",
  },
  ...baseConfig,
};

module.exports = [mainConfig, workerConfig];
