/* global __dirname */

'use strict';

var RadarrAPI = require('sonarr-api');
var _         = require('lodash');
var moment    = require('moment');

var i18n   = require(__dirname + '/../lib/lang');
var config = require(__dirname + '/../lib/config');
var state  = require(__dirname + '/../lib/state');
var logger = require(__dirname + '/../lib/logger');
var acl    = require(__dirname + '/../lib/acl');

/*
 * initalize the class
 */
function RadarrMessage(bot, user, cache) {
  this.bot      = bot;
  this.user     = user;
  this.cache    = cache;
  this.adminId  = config.bot.owner;
  this.username = this.user.username || (this.user.first_name + (' ' + this.user.last_name || ''));

  this.radarr = new RadarrAPI({
    hostname : config.radarr.hostname,
    apiKey   : config.radarr.apiKey,
    port     : config.radarr.port,
    urlBase  : config.radarr.urlBase,
    ssl      : config.radarr.ssl,
    username : config.radarr.username,
    password : config.radarr.password
  });
}

/*
 * perform commands
 */
RadarrMessage.prototype.performLibrarySearch = function(searchText) {
    var self = this;
    var query = searchText;

    // Grabs all movies and then performs regex on the results
    self.radarr.get('movie').then(function(result) {
      logger.info(i18n.__('logRadarrAllSeries',self.username));
      _.sortBy(result, 'title');

      var response = [];
      _.forEach(result, function(n, key) {

        var movie = '[' + n.title + '](https://www.imdb.com/title/' + n.imdbId + ')' + (n.year ? ' - _' + n.year + '_' : '');
        // if a query was submitted, filter the results here
        if (query) {
          if (n.title.search( new RegExp(query, 'i') ) !== -1) {
            response.push(movie);
          }
        } else {
          response.push(movie);
        }
      });

    if (!response.length) {
      throw new Error(i18n.__('errorRadarrUnableToLocate', query));
    }

    response.sort();

    if (query) {
      // add title to begining of the array
      response.unshift(i18n.__('botChatRadarrMatchingResults'));
    }

    // If there are more than 50 results, split the messages
    if (response.length > 50) {
      var splitReponse = _.chunk(response, 50);
      splitReponse.sort();
      var i = 0;
      var libraryLoop = setInterval(function () {
        var n = splitReponse[i];
        if (n === undefined) {
          clearInterval(libraryLoop);
        } else {
          n.sort();
          self._sendMessage(n.join('\n'), []);
        }
        i = i + 1;
      }, 200);
    } else {
      return self._sendMessage(response.join('\n'), []);
    }

  }).catch(function(error) {
    return self._sendMessage(error);
  });

};

RadarrMessage.prototype.performRssSync = function() {
  var self = this;

  logger.info(i18n.__('logRadarrRSSCommandSent'));

  self.radarr.post('command', { 'name': 'RssSync' })
  .then(function() {
    logger.info('logRadarrRSSCommandExecuted', self.username);
    return self._sendMessage(i18n.__('botChatSonnarRSSCommandExecuted'));
  })
  .catch(function(error) {
    return self._sendMessage(error);
  });
};

RadarrMessage.prototype.performWantedSearch = function() {
  var self = this;

  logger.info(i18n.__('logRadarrWantedCommandSent', self.username));

  self.radarr.post('command', {
      'name': 'missingMoviesSearch',
      'filterKey': 'monitored',
      'filterVaule': 'true'
  })
  .then(function() {
    logger.info(i18n.__('logRadarrWantedCommandExecuted', self.username));
    return self._sendMessage(i18n.__('botChatRadarrWantedCommandExecuted'));
  })
  .catch(function(error) {
    logger.debug('catch movies return message')
    return self._sendMessage(error);
  });
};

RadarrMessage.prototype.performLibraryRefresh = function() {
  var self = this;

  logger.info(i18n.__('logRadarrRefreshCommandSent', self.username));

  self.radarr.post('command', {
    'name': 'RefreshSeries'
  })
  .then(function() {
    logger.info(i18n.__('logRadarrRefreshCommandExecuted', self.username));
    return self._sendMessage(i18n.__('botChatRadarrRefreshCommandExecuted'));
  })
  .catch(function(error) {
    return self._sendMessage(error);
  });
};

RadarrMessage.prototype.performCalendarSearch = function(futureDays) {
  logger.info('Debug1');
  var self = this;
  logger.info('Debug2');

  var fromDate = moment().toISOString();
  var toDate = moment().add(futureDays, 'day').toISOString();

  logger.info('Debug3');
  logger.info(i18n.__('logRadarrUpcomingCommandSent', self.username, fromDate, toDate));
  logger.info('Debug4');

  self.radarr.get('calendar', { 'start': fromDate, 'end': toDate})
  .then(function (episode) {
    if (!episode.length) {
      throw new Error(i18n.__('errorRadarrNothingInCalendar'));
    }
    logger.info('Debug5');

    var lastDate = null;
    var response = [];
    _.forEach(episode, function(n, key) {
      logger.info('Debug6');
      var done = (n.hasFile ? i18n.__('RadarrDone') : '');
      var niceDate = moment(n.physicalRelease).format("MMM Do YYYY");
      logger.info(niceDate);
      logger.info('Debug61');

      // Add an empty line to break list of multiple days
      // if(lastDate != null && n.airDate != lastDate) response.push(' ');
      logger.info('Debug62');
      logger.info(n);

      response.push(niceDate + ' - ' + n.title + done);
      logger.info('Debug63');
      lastDate = n.airDate;
      logger.info('Debug64');
    });
    logger.info('Debug7');

    logger.info(i18n.__("logRadarrFoundSeries", self.username, response.join(',')));

    logger.info('Debug8');
    return self._sendMessage(response.join('\n'), []);
  })
  .catch(function(error) {
    return self._sendMessage(error);
  });
};


/*
 * handle the flow of adding a new series
 */
RadarrMessage.prototype.sendSeriesList = function(seriesName) {
  var self = this;

  self.test = 'hello';

  logger.info(i18n.__('logRadarrQueryCommandSent', self.username));

  self.radarr.get('movie/lookup', { 'term': seriesName }).then(function(result) {
    if (!result.length) {
      throw new Error(i18n.__('errorRadarrSerieNotFound', seriesName));
    }

    var series = result;

    logger.info(i18n.__('logRadarrUserSerieRequested', self.username, seriesName));

    var seriesList = [], keyboardList = [];

    series.length = (series.length > config.bot.maxResults ? config.bot.maxResults : series.length);

    var response = [i18n.__('botChatRadarrFoundNSeries', series.length)];

    _.forEach(series, function(n, key) {

      var imageCover = null;
      _.forEach(n.images, function(image, index){
        if(image.coverType === 'poster'){
          imageCover = image.url;
        }
      });

      console.log(n);

      var id = key + 1;
      var keyboardValue = n.title + (n.year ? ' - ' + n.year : '');

      seriesList.push({
        'id': id,
        'title': n.title,
        'plot': n.overview,
        'year': n.year,
        'tvdbId': n.tmdbId,
        'titleSlug': n.titleSlug,
        'seasons': n.seasons,
        'keyboardValue': keyboardValue,
        'coverUrl': imageCover
      });

      keyboardList.push([keyboardValue]);

      response.push('➸ ['+keyboardValue+'](https://www.themoviedb.org/movie/'+n.tmdbId+')');
    });

    response.push(i18n.__('selectFromMenu'));

    logger.info(i18n.__("logRadarrFoundSeries2", self.username, keyboardList.join(',')));

    // set cache
    self.cache.set('seriesList' + self.user.id, seriesList);
    self.cache.set('state' + self.user.id, state.radarr.CONFIRM);

    return self._sendMessage(response.join('\n'), keyboardList);
  })
  .catch(function(error) {
    return self._sendMessage(error);
  });
};

RadarrMessage.prototype.confirmShowSelect = function(displayName) {
  var self = this;

  var seriesList = self.cache.get('seriesList' + self.user.id);

  if (!seriesList) {
    return self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
  }

  var series = _.filter(seriesList, function(item) { return item.keyboardValue === displayName; })[0];
  if (!series) {
    return self._sendMessage(new Error(i18n.__('botChatRadarrSerieNotFound', displayName)));
  }

  // use workflow to run async tasks
  var workflow = new (require('events').EventEmitter)();

  // check for existing series on radarr
  // @todo fix existing check
  workflow.on('checkRadarrSeries', function () {
    self.radarr.get('movie').then(function(result) {
  //     logger.info(i18n.__('logRadarrLookingForExistingSeries', self.username));

  //     var existingSeries = _.filter(result, function(item) { return item.tvdbId === series.tmdbId; })[0];
  //     if (existingSeries) {
  //       throw new Error(i18n.__('errorRadarrSerieAlreadyTracked'));
  //     }
      workflow.emit('confirmShow');
  //   }).catch(function(error) {
  //     return self._sendMessage(error);
    });
  });

  // check for existing series on radarr
  workflow.on('confirmShow', function () {
    self.radarr.get('series').then(function(result) {
      logger.info(i18n.__('logRadarrConfirmCorrectShow', series.keyboardValue, self.username));

      var keyboardList = [[i18n.__('globalYes')], [i18n.__('globalNo')]];

      var response = ['*' + series.title + ' (' + series.year + ')*\n'];

      response.push(series.plot + '\n');
      response.push(i18n.__('botChatRadarrIsShowCorrect'));
      response.push(i18n.__('globalArrowYes'));
      response.push(i18n.__('globalArrowNo'));

      // Add cover to message (if available)
      if(series.coverUrl !== null){
        response.push('\n[Poster!](' + series.coverUrl + ')');
      }

      // set cache
      self.cache.set('state' + self.user.id, state.radarr.PROFILE);
      self.cache.set('seriesId' + self.user.id, series.id);

      return self._sendMessage(response.join('\n'), keyboardList);

    }).catch(function(error) {
      return self._sendMessage(error);
    });
  });

  /**
   * Initiate the workflow
   */
  workflow.emit('checkRadarrSeries');
};

RadarrMessage.prototype.sendProfileList = function(displayName) {
  var self = this;

  var seriesId = self.cache.get('seriesId' + self.user.id);

  if (!seriesId) {
    return self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
  }

  if(displayName == 'No'){
    return self._sendMessage(new Error(i18n.__('globalAborted')));
  }

  // use workflow to run async tasks
  var workflow = new (require('events').EventEmitter)();

  // get the radarr profiles
  workflow.on('getRadarrProfiles', function () {
    self.radarr.get('profile').then(function(result) {
      if (!result.length) {
        throw new Error(i18n.__('errorRadarrCouldntGetProfile'));
      }

      var profiles = result;

      logger.info(i18n.__('logRadarrProfileListRequested', self.username));

      var profileList = [], keyboardList = [], keyboardRow = [];
      var response = ['*Found ' + profiles.length + ' profiles*'];
      _.forEach(profiles, function(n, key) {

        profileList.push({ 'name': n.name, 'profileId': n.id });
        response.push('➸ ' + n.name);

        // Profile names are short, put two on each custom
        // keyboard row to reduce scrolling
        keyboardRow.push(n.name);
        if (keyboardRow.length === 2) {
          keyboardList.push(keyboardRow);
          keyboardRow = [];
        }
      });

      // console.log(profiles);

      if (keyboardRow.length === 1) {
        keyboardList.push([keyboardRow[0]]);
      }

      response.push(i18n.__('selectFromMenu'));

      logger.info(i18n.__('logRadarrFoundProfile', self.username, keyboardList.join(',')));

      // set cache
      self.cache.set('state' + self.user.id, state.radarr.FOLDER);
      self.cache.set('seriesProfileList' + self.user.id, profileList);

      return self._sendMessage(response.join('\n'), keyboardList);
    })
    .catch(function(error) {
      return self._sendMessage(error);
    });
  });

  /**
   * Initiate the workflow
   */
  workflow.emit('getRadarrProfiles');
};

RadarrMessage.prototype.sendFolderList = function(profileName) {
  var self = this;

  var profileList = self.cache.get('seriesProfileList' + self.user.id);
  if (!profileList) {
    return self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
  }

  var profile = _.filter(profileList, function(item) { return item.name === profileName; })[0];
  if (!profile) {
    return self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
  }

  self.radarr.get('rootfolder').then(function(result) {
    if (!result.length) {
      throw new Error(i18n.__("errorRadarrCouldntFindFolders"));
    }

    var folders = result;

    logger.info(i18n.__('logRadarrFolderListRequested', self.username));


    var folderList = [], keyboardList = [];
    var response = ['*Found ' + folders.length + ' folders*'];
    _.forEach(folders, function(n, key) {
      folderList.push({ 'path': n.path, 'folderId': n.id });

      response.push('➸ ' + n.path);

      keyboardList.push([n.path]);
    });

    // set cache
    self.cache.set('seriesProfileId' + self.user.id, profile.profileId);
    self.cache.set('seriesFolderList' + self.user.id, folderList);

    // if only 1 folder found skip folder selection
    if(folders.length == 1) {
      logger.info('only one folder found, skipping selection');
      logger.info(folders[0].path);
      self.cache.set('seriesFolderId' + self.user.id, folders[0].path);
      RadarrMessage.prototype.searchForMovie.call(self, folders[0].path);
      return null;
    }

    self.cache.set('state' + self.user.id, state.radarr.SEARCH_NOW);

    response.push(i18n.__('selectFromMenu'));

    logger.info(i18n.__('logRadarrFoundFolders', self.username, keyboardList.join(',')));

    return self._sendMessage(response.join('\n'), keyboardList);
  })
  .catch(function(error) {
    logger.info('something happened in this one');
    return self._sendMessage(error);
  });
};

RadarrMessage.prototype.searchForMovie = function(folderName) {
  var self = this;

  logger.info('running search for movie');

  var folderList = self.cache.get('seriesFolderList' + self.user.id);
  if (!folderList) {
    return self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
  }

  var folder = _.filter(folderList, function(item) { return item.path === folderName; })[0];
  if (!folder) {
    return self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
  }

  logger.info(i18n.__('logRadarrSeasonFoldersListRequested', self.username));

  var searchForMovie = [i18n.__('globalYes'), i18n.__('globalNo')];
  var searchForMovieList = [], keyboardList = [], keyboardRow = [];
  var response = [i18n.__('searchForMovieNow')];
  _.forEach(searchForMovie, function(n, key) {
    searchForMovieList.push({ 'type': n });

    response.push('➸ ' + n);

    keyboardRow.push(n);
    if (keyboardRow.length === 2) {
      keyboardList.push(keyboardRow);
      keyboardRow = [];
    }
  });

  if (keyboardRow.length === 1) {
    keyboardList.push([keyboardRow[0]]);
  }

  response.push(i18n.__('selectFromMenu'));

    logger.info(i18n.__('logRadarrFoundSeasonsFolderTypes', self.username, keyboardList.join(',')));


  self.cache.set('seriesFolderId' + self.user.id, folder.folderId);
  self.cache.set('seriesSearchForMovieList' + self.user.id, searchForMovieList);
  self.cache.set('state' + self.user.id, state.radarr.ADD_SERIES);

  return self._sendMessage(response.join('\n'), keyboardList);
};


RadarrMessage.prototype.sendAddSeries = function(searchForMovie) {
  var self = this;

  logger.info('run sendaddseries');

  var seriesId         = self.cache.get('seriesId' + self.user.id);
  var seriesList       = self.cache.get('seriesList' + self.user.id);
  var profileId        = self.cache.get('seriesProfileId' + self.user.id);
  var profileList      = self.cache.get('seriesProfileList' + self.user.id);
  var monitorId        = self.cache.get('seriesMonitorId' + self.user.id);
  var monitorList      = self.cache.get('seriesMonitorList' + self.user.id);
  var typeId           = self.cache.get('seriesTypeId' + self.user.id);
  var typeList         = self.cache.get('seriesTypeList' + self.user.id);
  var folderId         = self.cache.get('seriesFolderId' + self.user.id);
  var folderList       = self.cache.get('seriesFolderList' + self.user.id);
  var searchMovieId    = searchForMovie;
  var searchForMovieList   = self.cache.get('seriesSearchForMovieList' + self.user.id);

  if (!searchForMovieList) {
    console.log('searchForMovieList was not found');
    self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
  }

  var series       = _.filter(seriesList, function(item) { return item.id === seriesId; })[0];
  var profile      = _.filter(profileList, function(item) { return item.profileId === profileId; })[0];
  var monitor      = _.filter(monitorList, function(item) { return item.type === monitorId; })[0];
  var type         = _.filter(typeList, function(item) { return item.type === typeId; })[0];
  var folder       = _.filter(folderList, function(item) { return item.folderId === folderId; })[0];
  var search       = _.filter(searchForMovieList, function(item) { return item.type === searchMovieId; })[0];

  logger.info("checkpoint 2");

  var postOpts              = {};
  var addOptions              = {};

  postOpts.tmdbId           = series.tvdbId;
  postOpts.title            = series.title;
  postOpts.titleSlug        = series.titleSlug;
  postOpts.rootFolderPath   = folder.path;
  postOpts.monitored        = true;
  postOpts.qualityProfileId = profile.profileId;
  postOpts.images           = [];

  logger.info("checkpoint 3");
  addOptions.searchForMovie = (search.type === i18n.__("globalYes") ? true : false);
  postOpts.addOptions       = addOptions;

  logger.info("checkpoint 4");

  logger.info(i18n.__("logRadarrSerieAddedWithOptions", self.username, series.title, JSON.stringify(postOpts)));
  console.log('send message to Radarr');

  self.radarr.post('movie', postOpts).then(function(result) {
    logger.info(result);
    if (!result) {
      throw new Error(i18n.__("logRadarrSerieCantAdd"));
    }

    logger.info(i18n.__("logRadarrSerieAdded", self.username, series.title));

    if (self._isBotAdmin() && self.adminId !== self.user.id) {
      self.bot.sendMessage(self.user.id, i18n.__("botChatRadarrSerieAddedBy", series.title, self.username), {
        'selective': 2,
        'parse_mode': 'Markdown',
        'reply_markup': {
          'hide_keyboard': true
        }
      });
    }

    return self.bot.sendMessage(self.user.id, i18n.__("botChatRadarrSerieAdded", series.title), {
      'selective': 2,
      'parse_mode': 'Markdown',
      'reply_markup': {
        'hide_keyboard': true
      }
    });
  })
  .catch(function(error) {
    return self._sendMessage(error);
  })
  .finally(function() {
    self._clearCache();
  });

};

/*
 * private methods
 */
RadarrMessage.prototype._sendMessage = function(message, keyboard) {
  var self = this;
  keyboard = keyboard || [];

  var options;
  if (message instanceof Error) {
    logger.warn(i18n.__("logMessageClear", self.username, message.message));

    message = message.message;
    options = {
      'parse_mode': 'Markdown',
      'reply_markup': {
        'hide_keyboard': true
      }
    };
  } else {
    options = {
      // 'disable_web_page_preview': true,
      'parse_mode': 'Markdown',
      'selective': 2,
      'reply_markup': JSON.stringify( { keyboard: keyboard, one_time_keyboard: true })
    };
  }

  return self.bot.sendMessage(self.user.id, message, options);
};

RadarrMessage.prototype._isBotAdmin = function() {
  if (this.adminId === this.user.id) {
    return true;
  }
  return false;
};

RadarrMessage.prototype._clearCache = function() {
  var self = this;

  logger.info(i18n.__("logClearCache", self.username));

  var cacheItems = [
    'seriesId', 'seriesList', 'seriesProfileId',
    'seriesProfileList', 'seriesFolderId', 'seriesFolderList',
    'seriesMonitorId', 'seriesMonitorList', 'seriesFolderId',
    'seriesFolderList', 'seriesTypeId', 'seriesTypeList',
    'seriesSeasonFolderList', 'state'
  ];

  return _(cacheItems).forEach(function(item) {
    self.cache.del(item + self.user.id);
  });
};

module.exports = RadarrMessage;
