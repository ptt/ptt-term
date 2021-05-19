const path = require('path');
const webpack = require('webpack');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssUrlRelativePlugin = require('css-url-relative-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlWebpackHarddiskPlugin = require('html-webpack-harddisk-plugin');
const WebpackCdnPlugin = require('webpack-cdn-plugin');
const AliasPlugin = require('enhanced-resolve/lib/AliasPlugin');

const DEVELOPER_MODE = process.env.NODE_ENV === 'development'
const PRODUCTION_MODE = process.env.NODE_ENV !== 'development'

process.env.NODE_ENV = process.env.NODE_ENV || 'production'

module.exports = {
  entry: {
    'pttchrome': './src/entry.js',
  },
  output: {
    path: path.join(__dirname, 'dist/assets/'),
    publicPath: 'assets/',
    pathinfo: DEVELOPER_MODE,
    filename: `[name]${ PRODUCTION_MODE ? '.[chunkhash]' : '' }.js`
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: "babel-loader",
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      {
        test: /\.(bin|bmp|png|woff)$/,
        oneOf: [
          {
            resourceQuery: /inline/,
            use: 'url-loader'
          },
          {
            use: [
              {
                loader: 'file-loader',
                options: {
                  name: '[name].[hash].[ext]',
                  esModule: false,
                }
              }
            ]
          }
        ]
      }
    ]
  },
  resolve: {
    plugins: [new AliasPlugin('described-resolve', [{
      name: 'Icon',
      alias: [
        path.resolve(__dirname, `src/icon/${process.env.PTTCHROME_THEME || 'pttchrome'}/`),
        path.resolve(__dirname, 'src/icon/')
      ]
    }], 'resolve')]
  },
  devtool: 'source-map',
  optimization: {
    minimizer: [new OptimizeCSSAssetsPlugin({})],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.PTTCHROME_PAGE_TITLE': JSON.stringify(process.env.PTTCHROME_PAGE_TITLE || 'PttChrome'),
      'process.env.DEFAULT_SITE': JSON.stringify(PRODUCTION_MODE ? process.env.DEFAULT_SITE || 'wsstelnet://ws.ptt.cc/bbs' : 'wstelnet://localhost:8080/bbs'),
      'process.env.ALLOW_SITE_IN_QUERY': JSON.stringify(process.env.ALLOW_SITE_IN_QUERY === 'yes'),
      'process.env.DEVELOPER_MODE': JSON.stringify(DEVELOPER_MODE),
      'PTTCHROME.NAME': JSON.stringify(process.env.npm_package_name),
      'PTTCHROME.VERSION': JSON.stringify(process.env.npm_package_version),
      'PTTCHROME.GITHUB_REPOSITORY_OWNER': JSON.stringify(process.env.GITHUB_REPOSITORY_OWNER || 'ccns'),
      'PTTCHROME.GITHUB_REPOSITORY': JSON.stringify(process.env.GITHUB_REPOSITORY || 'ccns/PttChrome'),
    }),
    new MiniCssExtractPlugin({
      filename: '[name].[chunkhash].css',
      chunkFilename: '[id].css',
    }),
    new CssUrlRelativePlugin(),
    new HtmlWebpackPlugin({
      alwaysWriteToDisk: DEVELOPER_MODE,
      minify: {
        collapseWhitespace: PRODUCTION_MODE,
        removeComments: PRODUCTION_MODE
      },
      inject: 'head',
      template: './src/dev.html',
      filename: '../index.html'
    }),
    new WebpackCdnPlugin({
      crossOrigin: 'anonymous',
      modules: [
        {
          // jQuery must be loaded before bootstrap.
          name: 'jquery',
          var: 'jQuery',
          path: 'dist/jquery.min.js',
        },
        {
          name: 'bootstrap',
          var: 'bootstrap',
          path: 'dist/js/bootstrap.min.js',
          style: 'dist/css/bootstrap.min.css',
        },
        {
          name: 'hammerjs',
          var: 'Hammer',
          path: 'hammer.min.js',
        },
        {
          name: 'react',
          var: 'React',
          path: `umd/react.${process.env.NODE_ENV}${PRODUCTION_MODE ? '.min' : ''}.js`,
        },
        {
          name: 'react-dom',
          var: 'ReactDOM',
          path: `umd/react-dom.${process.env.NODE_ENV}${PRODUCTION_MODE ? '.min' : ''}.js`,
        },
      ],
    })
  ].concat(PRODUCTION_MODE ? [
    new UglifyJSPlugin({
      sourceMap: true,
      parallel: true
    }),
  ] : [
    new HtmlWebpackHarddiskPlugin()
  ]),
  devServer: {
    contentBase: path.join(__dirname, './dist'),
    proxy: {
      '/bbs': {
        target: process.env.DEV_PROXY_TARGET || 'https://ws.ptt.cc',
        secure: true,
        ws: true,
        changeOrigin: true,
        onProxyReqWs(proxyReq) {
          // Whitelist does not accept ws.ptt.cc
          proxyReq.setHeader('origin', process.env.DEV_PROXY_HEADER || 'https://term.ptt.cc');
        }
      }
    }
  }
};
