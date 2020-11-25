import elm from 'rollup-plugin-elm'
import htmlTemplate from 'rollup-plugin-generate-html-template'
import serve from 'rollup-plugin-serve'
import postcss from 'rollup-plugin-postcss'

export default {
  input: 'src/index.js',
  output: {
    file: 'build/bundle.js',
    format: 'iife'
  },
  plugins: [
    htmlTemplate({
      template: 'src/index.html',
      target: 'build/index.html',
    }),
    elm({
      optimize: true,
      debug: false,
      exclude: 'elm_stuff/**'
    }),
    postcss({
      plugins: []
    }),
    serve('build')
  ]
}
