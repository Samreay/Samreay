/*
* A tailwinds config file used to generate atomic utility css classes.
* See: https://tailwindcss.com/docs/configuration/
* Default: https://github.com/tailwindcss/tailwindcss/blob/master/stubs/defaultConfig.stub.js
*
* Run '$ npm run css:dev' to compile changes in this file.
*/

module.exports = {
    purge: [
        '{,!(node_modules|_site)/**/}*.{html,md}',
    ],
    darkMode: "class",
    theme: {
        extend: {
          colors: {
            gray: {
              100: '#EBF1F5',
              200: '#D9E3EA',
              300: '#C5D2DC',
              400: '#9BA9B4',
              500: '#707D86',
              600: '#55595F',
              700: '#33363A',
              800: '#25282C',
              900: '#151719',
              950: '#0f1112',
            },
            purple: {
              100: '#F4F4FF',
              200: '#E2E1FF',
              300: '#CBCCFF',
              400: '#ABABFF',
              500: '#af8dff',
              600: '#8e5dff',
              700: '#7b4acf',
              800: '#38379C',
              900: '#262668',
            },
            main: {
              100: '#fff8d8',
              200: '#fbe7b3',
              300: '#fad58f',
              400: '#fcc06e',
              500: '#ffaa50',
              600: '#d17b3e',
              700: '#a1502c',
              800: '#672116',
              900: '#410400',
            }
          },          
          spacing: {
            '9/16': '56.25%',
            '3/4': '75%',
            '1/1': '100%',
          },
          fontFamily: {
            inter: ['Inter', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'],
            'architects-daughter': ['"Architects Daughter"', 'sans-serif']
          },
          fontSize: {
            xs: '0.75rem',
            sm: '0.875rem',
            base: '1rem',
            lg: '1.125rem',
            xl: '1.25rem',
            '2xl': '1.5rem',
            '3xl': '2rem',
            '4xl': '2.5rem',
            '5xl': '3.25rem',
            '6xl': '4rem',
          },
          inset: {
            'full': '100%',
          },
          letterSpacing: {
            tighter: '-0.02em',
            tight: '-0.01em',
            normal: '0',
            wide: '0.01em',
            wider: '0.02em',
            widest: '0.4em',
          },
          minWidth: {
            '10': '2.5rem',
          },
          scale: {
            '98': '.98'
          },
        },
    },
    variants: {
        backgroundColor: ['responsive', 'hover', 'focus', 'group-hover'],
        textColor: ['responsive', 'hover', 'focus', 'group-hover'],
        translate: ['responsive', 'hover', 'focus', 'group-hover'],
        boxShadow: ['responsive', 'hover', 'focus', 'focus-within'],
        opacity: ['responsive', 'hover', 'focus', 'group-hover'],
    },
    plugins: [
        require('@tailwindcss/forms'),
    ],
    
}
