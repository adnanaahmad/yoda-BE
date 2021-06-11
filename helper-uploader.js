'use strict';
/*jshint esversion: 8 */
const utils = require('./utils');

const fastify = require('fastify')({
  logger: false,
  trustProxy: true,
  //ignoreTrailingSlash: true
});

const fileUpload = require('fastify-file-upload')

fastify.register(fileUpload)

fastify.post('/', async (req, res) => {
  // some code to handle file

  const files = req.raw.files
  // if (files === null || !files || Object.keys(req.files).length === 0) {
  //   return res.status(400).send('No files were uploaded.');
  // }

  let fileArr = [];
  for (let key in files) {
    const file = files[key];
    fileArr.push({
      name: file.name,
      mimetype: file.mimetype
    });

    //TODO!
    let upDir = __dirname + '/uploads/';
    if (req.ip === '54.177.210.250' || req.ip === '54.193.141.171' || req.ip === '23.20.206.43') {
      upDir = '/usr/share/nginx/html/data/od7kTXfGxDax/';
    }

    if (!await utils.fileExists(upDir)) {
      await utils.dirCreate(upDir);
    }

    let uploadPath = upDir + file.name;
    console.log(req.ip, uploadPath);

    file.mv(uploadPath, (err) => {
      if (err)
        return res.status(500).send(err);

      //res.send('File uploaded!');
    });
  }
  res.send(fileArr)
})

fastify.listen(3000, err => {
  if (err) throw err
  console.log(`server listening on ${fastify.server.address().port}`)
})