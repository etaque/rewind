import path from 'path'
import elm from 'rollup-plugin-elm'
import htmlTemplate from 'rollup-plugin-generate-html-template'
import serve from 'rollup-plugin-serve'
import postcss from 'rollup-plugin-postcss'
import { terser } from 'rollup-plugin-terser'

const production = process.env.NODE_ENV == 'production'
const target = production ? 'dist' : 'build'

export default {
  input: 'src/index.js',
  output: {
    file: path.join(target, production ? 'bundle.min.js' : 'bundle.js'),
    format: 'iife'
  },
  plugins: [
    htmlTemplate({
      template: 'src/index.html',
      target: path.join(target, 'index.html'),
    }),
    elm({
      optimize: true,
      debug: false,
      exclude: 'elm_stuff/**'
    }),
    postcss({
      plugins: []
    }),
    production && terser(),
    !production && serve('build')
  ]
}
