import express from 'express'
import path from 'path'
import fs from 'fs'
import marked from 'marked'
import Finder from 'fs-finder'
let log

let shouldIgnore = (filePath) => {
  // remove starting and trailing slashed
  filePath = filePath.replace(/^\/|\/$/g, '')
  // create array out of path
  var arr = filePath.split(path.sep)
  // test for starting underscore, .git, .gitignore
  var map = arr.map(function(item){
    return item[0] === "_" || item.indexOf(".git") === 0
  })
  // return if any item starts with underscore
  return map.indexOf(true) !== -1
}

let handle404Fallback = (options) => {

  let handler = (options, req, res, next) => {
    res.status(404)
    fs.exists(path.join(options.basedir, '404.ejs'), function(exists) {
        if (exists) {
            res.render('404', { error: new Error('yarrr') })
        } else {
          fs.exists(path.join(options.basedir, '404.html'), function(exists) {
              if (exists) {
                  res.sendFile(path.join(options.basedir, '404.html'))
              } else {
                  next()
              }
          })
        }
    })
  }

  if (arguments.length == 1) {
    handler(options)
  } else {
    return (req, res, next) => {
      handler(options, req, res, next)
    }
  }
}

let disallowPrivateDirectories = (req, res, next) => {
  if (shouldIgnore(req.url)) {
    handle404Fallback(req, res, next)
  } else {
    next()
  }
}

let handleEJS = (options) => {
  return (req, res, next) => {
    requireAsyncDataFile(options.basedir, (data) => {
      let template_path = req.originalUrl == '/' ? 'index' : req.originalUrl.substring(1)

      req.template_path = template_path
      req.template_realpath = path.join(
        options.publicdir
        , template_path
      ) + '.ejs'

      log(
        'Attempting to load EJS file: %s'
        , req.template_realpath
      )

      fs.exists(req.template_realpath, function(exists) {
          if (exists) {
            log(
              'Requesting view: %s'
              , req.template_realpath
            )

            let vars = {...data, ...options}

            log('Sending to EJS:', vars)
            res.render(req.template_realpath, vars)
          } else {
            log(
              'File not found: %s'
              , req.template_realpath
            )
            next()
          }
      })
    })
  }
}

let handlePrettyHtml = (options) => {
  return (req, res, next) => {
    let template_path = req.originalUrl == '/' ? 'index.html' : req.originalUrl
    if ( ! path.extname(template_path).length ) {
      template_path += '.html'
    }

    req.template_path = template_path
    req.template_realpath = path.join(
      options.publicdir,
      template_path
    )

    log(
      'Attempting to load HTML file: %s'
      , req.template_realpath
    )
    fs.exists(req.template_realpath, function(exists) {
        if (exists) {
          log(
            'Requesting view: %s'
            , req.template_path
          )
          res.sendFile(req.template_realpath)
        } else {
          log(
            'File not found: %s'
            , req.template_path
          )
          next()
        }
    })
  }
}

let handleMarkdown = (options) => {
  return (req, res, next) => {
    let template_path = req.originalUrl == '/' ? 'index.md' : req.originalUrl
    if ( ! path.extname(template_path).length ) {
      template_path += '.md'
    }

    req.template_path = template_path
    req.template_realpath = path.join(
      options.publicdir,
      template_path
    )

    log(
      'Attempting to load MARKDOWN file: %s'
      , req.template_realpath
    )
    fs.exists(req.template_realpath, function(exists) {
        if (exists) {
          log(
            'Requesting view: %s'
            , req.template_path
          )

          fs.readFile(req.template_realpath, function (err, data) {
             if (err) {
                 return console.error(err)
             }

             res.end(marked(data.toString(), options.marked))
          })

        } else {
          log(
            'File not found: %s'
            , req.template_path
          )
          next()
        }
    })
  }
}

let requireAsyncDataFile = (dir, callback) => {
  let data = {}
  Finder
    .from(dir)
    .exclude(['.git', 'node_modules'])
    .findFiles('_data.js', (files) => {
    	if (files) {
        files.forEach((file) => {
          let dataSet = require(file)
          if (dataSet.globals != undefined) {
            data = {...data, ...dataSet.globals}
            // delete dataSet.globals
          }

          data = { ...data, ...dataSet }
        })
      }
      callback(data)
    })
}

module.exports = (app, userOptions) => {
  let options = userOptions || {
    base: 'public',
    _layoutFile: '_layout.ejs',
    marked: {},
    log: false
  }

  options.basedir = path.dirname(path.resolve(options.base))
  options.publicdir = path.resolve(options.base)

  log = function() {
    if ( options.log ) {
      console.log.apply(console, arguments)
    }
  }

  app.engine('ejs', require('ejs-mate'))
  app.set('view engine', 'ejs')
  app.set('views', options.publicdir)

  let router = express.Router()

  router.use(disallowPrivateDirectories)
  router.use(handleEJS(options))
  router.use(handlePrettyHtml(options))
  router.use(handleMarkdown(options))
  router.use(handle404Fallback(options))

  return router
}
