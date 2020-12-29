const path = require("path");
const dist = path.resolve(__dirname, "dist");

const WebpackBar = require("webpackbar");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const Dotenv = require("dotenv-webpack");

const mode = "development";

const config = {
  entry: path.resolve(__dirname, "src", "index.ts"),
  output: {
    path: dist,
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
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".elm"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
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
        { from: "src/sphere/land-110m.json", to: path.resolve(dist, "sphere") }
      ]
    }),
  ],
};

module.exports = config;
