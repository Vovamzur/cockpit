const path = require('path')
const Copy = require('copy-webpack-plugin')
const Extract = require('mini-css-extract-plugin')
const fs = require('fs')
const CompressionPlugin = require('compression-webpack-plugin')

const externals = { cockpit: 'cockpit' }

/* These can be overridden, typically from the Makefile.am */
const srcdir = (process.env.SRCDIR || __dirname) + path.sep + 'src'
const builddir = process.env.SRCDIR || __dirname
const distdir = builddir + path.sep + 'dist'
const section = process.env.ONLYDIR || null
const nodedir = path.resolve(process.env.SRCDIR || __dirname, 'node_modules')

const production = process.env.NODE_ENV === 'production'

const info = {
  entries: {
    index: ['./index.js']
  },
  files: ['index.html', 'manifest.json']
}

const output = {
  path: distdir,
  filename: '[name].js',
  sourceMapFilename: '[file].map'
}

/*
 * Note that we're avoiding the use of path.join as webpack and nodejs
 * want relative paths that start with ./ explicitly.
 *
 * In addition we mimic the VPATH style functionality of GNU Makefile
 * where we first check builddir, and then srcdir.
 */

function vpath (/* ... */) {
  const filename = Array.prototype.join.call(arguments, path.sep)
  let expanded = builddir + path.sep + filename
  if (fs.existsSync(expanded)) {
    return expanded
  }
  expanded = srcdir + path.sep + filename
  return expanded
}

/* Qualify all the paths in entries */
Object.keys(info.entries).forEach(function (key) {
  if (section && key.indexOf(section) !== 0) {
    delete info.entries[key]
    return
  }

  info.entries[key] = info.entries[key].map(function (value) {
    if (value.indexOf('/') === -1) return value
    else return vpath(value)
  })
})

/* Qualify all the paths in files listed */
const files = []
info.files.forEach(function (value) {
  if (!section || value.indexOf(section) === 0) { files.push({ from: vpath('src', value), to: value }) }
})
info.files = files

const plugins = [
  new Copy({ patterns: info.files }),
  new Extract({ filename: '[name].css' })
]

/* Only minimize when in production mode */
if (production) {
  /* Rename output files when minimizing */
  output.filename = '[name].min.js'

  plugins.unshift(
    new CompressionPlugin({
      test: /\.(js|html)$/,
      minRatio: 0.9,
      deleteOriginalAssets: true
    })
  )
}

/* keep this in sync with cockpit.git */
const babelLoader = {
  loader: 'babel-loader',
  options: {
    presets: [
      [
        '@babel/env',
        {
          targets: {
            chrome: '57',
            firefox: '52',
            safari: '10.3',
            edge: '16',
            opera: '44'
          }
        }
      ],
      '@babel/preset-react'
    ]
  }
}

module.exports = {
  mode: production ? 'production' : 'development',
  resolve: {
    modules: [nodedir]
  },
  watchOptions: {
    ignored: /node_modules/
  },
  entry: info.entries,
  externals: externals,
  output: output,
  devtool: 'source-map',
  module: {
    rules: [
      {
        enforce: 'pre',
        exclude: /node_modules/,
        loader: 'eslint-loader',
        test: /\.(js|jsx)$/
      },
      {
        exclude: /node_modules/,
        use: babelLoader,
        test: /\.(js|jsx)$/
      },
      /* HACK: remove unwanted fonts from PatternFly's css */
      {
        test: /patternfly-4-cockpit.scss$/,
        use: [
          Extract.loader,
          {
            loader: 'css-loader',
            options: {
              sourceMap: true,
              url: false
            }
          },
          {
            loader: 'string-replace-loader',
            options: {
              multiple: [
                {
                  search: /src:url\("patternfly-icons-fake-path\/pficon[^}]*/g,
                  replace: "src:url('fonts/patternfly.woff')format('woff');"
                },
                {
                  search: /@font-face[^}]*patternfly-fonts-fake-path[^}]*}/g,
                  replace: ''
                }
              ]
            }
          },
          {
            loader: 'sass-loader',
            options: {
              sassOptions: {
                outputStyle: 'compressed'
              },
              sourceMap: true
            }
          }
        ]
      },
      {
        test: /\.s?css$/,
        exclude: /patternfly-4-cockpit.scss/,
        use: [
          Extract.loader,
          {
            loader: 'css-loader',
            options: {
              sourceMap: true,
              url: false
            }
          },
          {
            loader: 'sass-loader',
            options: {
              sassOptions: {
                outputStyle: 'compressed'
              },
              sourceMap: true
            }
          }
        ]
      }
    ]
  },
  plugins
}
