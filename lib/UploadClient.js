var Crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var Util = require('util');
var Client = require('./Client');
var Constants = require('./Constants');
var RestParameterValidator = require('./RestParameterValidator');
var request = require('request');
var http = require('http');
var url = require('url');

/**
 * Creates an instance of UploadClient.
 *
 * @constructor
 * @this {UploadClient}
 * @param {String} consumerKey OAuth consumer key.
 * @param {String} consumerSecret OAuth consumer secret.
 * @param {String} token OAuth token.
 * @param {String} tokenSecret OAuth token secret.
 */
var UploadClient = function(consumerKey, consumerSecret, token, tokenSecret)
{
    Client.call(this, consumerKey, consumerSecret, token, tokenSecret);

    this._apiBaseUrlString = Constants.UploadApiBaseURLString;
    this._apiVersion = Constants.UploadApiVersion;
    this._validator = new RestParameterValidator();
};

Util.inherits(UploadClient, Client);

/**
 *
 *
 * For information on acceptable parameters see the official <a href="https://dev.twitter.com/docs/api/1/post/statuses/update_with_media">Twitter documenation</a>.
 *
 * @this {UploadClient}
 * @param {Dictionary} parameters
 * @param {Function} callback The callback function.
 */
UploadClient.prototype.statusesUpdateWithMedia = function(parameters, callback)
{
    var status = parameters['status'];
    if (status === undefined)
    {
        throw new Error('Missing required parameter: status.');
    }

    var media = parameters['media[]'] || parameters['mediaExt[]'];
    if (media === undefined)
    {
        throw new Error('Missing required parameter: media[].');
    }

    this._validator.validateDisplayCoordinates(parameters);
    this._validator.validateInReplyToStatusId(parameters);
    this._validator.validatePlaceId(parameters);
    this._validator.validatePossiblySensitive(parameters);
    this._validator.validateLatitude(parameters);
    this._validator.validateLongitude(parameters);
    //this._validator.validateMedia(parameters);
    this._validator.validateStatus(parameters);

    var resource = 'statuses/update_with_media';

    this._createPostRequest(resource, 'json', parameters, callback);
};

/**
 * Creates an HTTP POST request.
 *
 * @private
 * @this {Client}
 * @param {String} resource The Twitter API resource to call.
 * @param {String} format The format in which to return data.
 * @param {Dictionary} parameters Parameters required to access the resource.
 * @param {Function} callback The callback function.
 */
UploadClient.prototype._createPostRequest = function(resource, format, parameters, callback)
{
	var self = this;
    var multipartItems = [];

	sendRequest = function(multipartItems){
		console.log("*********SEND REQUEST");
		var requestUrlString = self._apiBaseUrlString + '/' + self._apiVersion + '/' + resource + '.' + format;
		var requestOptions = {
			headers: {'content-type': 'multipart/form-data'},
			method: 'POST',
			url: requestUrlString,
			oauth: self.oauth(),
			multipart: multipartItems
		};

		var httpRequest = request.post(requestOptions);
		httpRequest.hash =  Crypto.createHash('sha1').update(JSON.stringify(httpRequest.headers), 'utf8').digest('hex');
		self._connections[httpRequest.hash] = {callback: callback, data: '', httpRequest: httpRequest};
		self._createEventListenersForRequest(httpRequest);
	};

    for (key in parameters)
    {
        var multipartItem = {};

        var contentDisposition = 'form-data; name="' + key + '"';
        var contentType = 'text/plain';
        var body = parameters[key];

		if(key == 'mediaExt[]'){

			// body = i1.manta-r1.com/image/f90ebe90-bf20-4e92-9926-ab2343634ca7/L6WkN
			var parsedURL = url.parse(body);
			console.log("parsedURL", parsedURL);


			var options = {
				host: parsedURL.host
				, port: 80
				, path: parsedURL.pathname
				, method: 'GET'
			}

			contentDisposition = 'form-data; name="media[]"';
			var imagedata = ''
			var imgrequest = http.request(options, function(res){
				res.setEncoding('binary');
				res.on('data', function(chunk){
					imagedata += chunk;
				});

					res.on('end', function(){

					body = imagedata;

					multipartItem['content-transfer-encoding'] = 'utf8';
					multipartItem['content-disposition'] = contentDisposition;
					multipartItem['content-type'] = res.headers['content-type'];

					multipartItem.body = new Buffer(body, 'binary');

					multipartItems.push(multipartItem);
					sendRequest(multipartItems);
				})

			});

			imgrequest.on('error', function(e){
				console.log("ERROR: ", e.message);
			});


			imgrequest.end();

		}else if (key == 'media[]'){

			var mediaFilePath = path.normalize(parameters[key]);
			var mediaFileExtensionName = path.extname(mediaFilePath);
			var mimeType = self._mimeTypeForPathExtension(mediaFileExtensionName);
			if (mimeType === null)
			{
				throw new Error('Unsupported media type.');
			}
			contentType = mimeType;
			multipartItem['content-transfer-encoding'] = 'utf8';
			multipartItem['content-disposition'] = contentDisposition;
			multipartItem['content-type'] = contentType;

			fs.readFile(mediaFilePath, function (err, data) {
				if (err) {
					console.log("error reading file", err);
					throw err;
				} else {
					multipartItem.body = data;
					multipartItems.push(multipartItem);
					sendRequest(multipartItems);
				}

			});

        }else{
			multipartItem['content-disposition'] = contentDisposition;
			multipartItem['content-type'] = contentType;
			multipartItem.body = body;

			multipartItems.push(multipartItem);
		}
    }


};

UploadClient.prototype._mimeTypeForPathExtension = function(pathExtension)
{
    var mimeType = null;

    switch(pathExtension.toLowerCase())
    {
        case '.gif':
            mimeType = 'image/gif';
            break;
        case '.jpeg':
        case '.jpg':
            mimeType = 'image/jpeg';
            break;
        case '.png':
            mimeType = 'image/png';
            break;
    }

    return mimeType;
}

module.exports = UploadClient;
