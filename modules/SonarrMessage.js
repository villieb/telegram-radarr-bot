/* global __dirname */

'use strict';

var SonarrAPI = require('sonarr-api');
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
function SonarrMessage(bot, user, cache) {
  this.bot      = bot;
  this.user     = user;
  this.cache    = cache;
  this.adminId  = config.bot.owner;
  this.username = this.user.username || (this.user.first_name + (' ' + this.user.last_name || ''));

  this.sonarr = new SonarrAPI({
    hostname : config.sonarr.hostname,
    apiKey   : config.sonarr.apiKey,
    port     : config.sonarr.port,
    urlBase  : config.sonarr.urlBase,
    ssl      : config.sonarr.ssl,
    username : config.sonarr.username,
    password : config.sonarr.password
  });
}

/*
 * perform commands
 */
SonarrMessage.prototype.performLibrarySearch = function(searchText) {
  var self = this;

  var query = searchText;
  console.log('debug1');
  self.sonarr.get('movie').then(function(result) {
    console.log('debug2');
    logger.info(i18n.__('logSonarrAllSeries',self.username));

    _.sortBy(result, 'title');
    console.log('debug3');

    var response = [];
    console.log('debug4');
    _.forEach(result, function(n, key) {
      console.log('debug5');
      console.log(n);
      console.log(key);
      var series = '[' + n.title + '](https://www.imdb.com/title/' + n.imdbId + ')' + (n.year ? ' - _' + n.year + '_' : '');
      if (query) {
        console.log('debug6');
        if (n.title.search( new RegExp(query, 'i') ) !== -1) {
          console.log('debug7');
          response.push(series);
        }
      } else {
        console.log('debug8');
        response.push(series);
      }
      console.log('debug9');
    });
    console.log('debug10');

    if (!response.length) {
      throw new Error(i18n.__('errorSonarrUnableToLocate', query));
    }

    response.sort();

    if (query) {
      // add title to begining of the array
      response.unshift(i18n.__('botChatSonnarMatchingResults'));
    }

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

SonarrMessage.prototype.performRssSync = function() {
  var self = this;

  logger.info(i18n.__('logSonarrRSSCommandSent'));

  self.sonarr.post('command', { 'name': 'RssSync' })
  .then(function() {
    logger.info('logSonarrRSSCommandExecuted', self.username);
    return self._sendMessage(i18n.__('botChatSonnarRSSCommandExecuted'));
  })
  .catch(function(error) {
    return self._sendMessage(error);
  });
};

SonarrMessage.prototype.performWantedSearch = function() {
  var self = this;

  logger.info(i18n.__('logSonarrWantedCommandSent', self.username));

  self.sonarr.get('/wanted/missing', {
    'page': 1,
    'pageSize': 50,
    'sortKey': 'airDateUtc',
    'sortDir': 'desc'
  })
  .then(function(wantedEpisodes) {
    var episodeIds = [];
    _.forEach(wantedEpisodes.records, function(n, key) {
      episodeIds.push(n.id);
    });
    return episodeIds;
  })
  .then(function(episodes) {
    self.sonarr.post('command', {
      'name': 'EpisodeSearch',
      'episodeIds': episodes
    })
    .then(function() {
      logger.info(i18n.__('logSonarrWantedCommandExecuted', self.username));
      return self._sendMessage(i18n.__('botChatSonarrWantedCommandExecuted'));
    })
    .catch(function(error) {
      return self._sendMessage(error);
    });
  })
  .catch(function(error) {
    return self._sendMessage(error);
  });
};

SonarrMessage.prototype.performLibraryRefresh = function() {
  var self = this;

  logger.info(i18n.__('logSonarrRefreshCommandSent', self.username));

  self.sonarr.post('command', {
    'name': 'RefreshSeries'
  })
  .then(function() {
    logger.info(i18n.__('logSonarrRefreshCommandExecuted', self.username));
    return self._sendMessage(i18n.__('botChatSonarrRefreshCommandExecuted'));
  })
  .catch(function(error) {
    return self._sendMessage(error);
  });
};

SonarrMessage.prototype.performCalendarSearch = function(futureDays) {
  logger.info('Debug1');
  var self = this;
  logger.info('Debug2');

  var fromDate = moment().toISOString();
  var toDate = moment().add(futureDays, 'day').toISOString();

  logger.info('Debug3');
  logger.info(i18n.__('logSonarrUpcomingCommandSent', self.username, fromDate, toDate));
  logger.info('Debug4');

  self.sonarr.get('calendar', { 'start': fromDate, 'end': toDate})
  .then(function (episode) {
    if (!episode.length) {
      throw new Error(i18n.__('errorSonarrNothingInCalendar'));
    }
    logger.info('Debug5');

    var lastDate = null;
    var response = [];
    _.forEach(episode, function(n, key) {
      logger.info('Debug6');
      var done = (n.hasFile ? i18n.__('SonarrDone') : '');
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

    logger.info(i18n.__("logSonarrFoundSeries", self.username, response.join(',')));

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
SonarrMessage.prototype.sendSeriesList = function(seriesName) {
  var self = this;

  self.test = 'hello';

  logger.info(i18n.__('logSonarrQueryCommandSent', self.username));

  self.sonarr.get('movie/lookup', { 'term': seriesName }).then(function(result) {
    if (!result.length) {
      throw new Error(i18n.__('errorSonarrSerieNotFound', seriesName));
    }

    var series = result;

    logger.info(i18n.__('logSonarrUserSerieRequested', self.username, seriesName));

    var seriesList = [], keyboardList = [];

    series.length = (series.length > config.bot.maxResults ? config.bot.maxResults : series.length);

    var response = [i18n.__('botChatSonarrFoundNSeries', series.length)];

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

    logger.info(i18n.__("logSonarrFoundSeries2", self.username, keyboardList.join(',')));

    // set cache
    self.cache.set('seriesList' + self.user.id, seriesList);
    self.cache.set('state' + self.user.id, state.sonarr.CONFIRM);

    return self._sendMessage(response.join('\n'), keyboardList);
  })
  .catch(function(error) {
    return self._sendMessage(error);
  });
};

SonarrMessage.prototype.confirmShowSelect = function(displayName) {
  var self = this;

  var seriesList = self.cache.get('seriesList' + self.user.id);

  if (!seriesList) {
    return self._sendMessage(new Error(i18n.__('errorSonarrWentWrong')));
  }

  var series = _.filter(seriesList, function(item) { return item.keyboardValue === displayName; })[0];
  if (!series) {
    return self._sendMessage(new Error(i18n.__('botChatSonarrSerieNotFound', displayName)));
  }

  // use workflow to run async tasks
  var workflow = new (require('events').EventEmitter)();

  // check for existing series on sonarr
  // @todo fix existing check
  workflow.on('checkSonarrSeries', function () {
    self.sonarr.get('movie').then(function(result) {
  //     logger.info(i18n.__('logSonarrLookingForExistingSeries', self.username));

  //     var existingSeries = _.filter(result, function(item) { return item.tvdbId === series.tmdbId; })[0];
  //     if (existingSeries) {
  //       throw new Error(i18n.__('errorSonarrSerieAlreadyTracked'));
  //     }
      workflow.emit('confirmShow');
  //   }).catch(function(error) {
  //     return self._sendMessage(error);
    });
  });

  // check for existing series on sonarr
  workflow.on('confirmShow', function () {
    self.sonarr.get('series').then(function(result) {
      logger.info(i18n.__('logSonarrConfirmCorrectShow', series.keyboardValue, self.username));

      var keyboardList = [[i18n.__('globalYes')], [i18n.__('globalNo')]];

      var response = ['*' + series.title + ' (' + series.year + ')*\n'];

      response.push(series.plot + '\n');
      response.push(i18n.__('botChatSonarrIsShowCorrect'));
      response.push(i18n.__('globalArrowYes'));
      response.push(i18n.__('globalArrowNo'));

      // Add cover to message (if available)
      if(series.coverUrl !== null){
        response.push('\n[Poster!](' + series.coverUrl + ')');
      }

      // set cache
      self.cache.set('state' + self.user.id, state.sonarr.PROFILE);
      self.cache.set('seriesId' + self.user.id, series.id);

      return self._sendMessage(response.join('\n'), keyboardList);

    }).catch(function(error) {
      return self._sendMessage(error);
    });
  });

  /**
   * Initiate the workflow
   */
  workflow.emit('checkSonarrSeries');
};

SonarrMessage.prototype.sendProfileList = function(displayName) {
  var self = this;

  var seriesId = self.cache.get('seriesId' + self.user.id);

  if (!seriesId) {
    return self._sendMessage(new Error(i18n.__('errorSonarrWentWrong')));
  }

  if(displayName == 'No'){
    return self._sendMessage(new Error(i18n.__('globalAborted')));
  }

  // use workflow to run async tasks
  var workflow = new (require('events').EventEmitter)();

  // get the sonarr profiles
  workflow.on('getSonarrProfiles', function () {
    self.sonarr.get('profile').then(function(result) {
      if (!result.length) {
        throw new Error(i18n.__('errorSonarrCouldntGetProfile'));
      }

      var profiles = result;

      logger.info(i18n.__('logSonarrProfileListRequested', self.username));

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

      logger.info(i18n.__('logSonarrFoundProfile', self.username, keyboardList.join(',')));

      // set cache
      self.cache.set('state' + self.user.id, state.sonarr.FOLDER);
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
  workflow.emit('getSonarrProfiles');
};

SonarrMessage.prototype.sendFolderList = function(profileName) {
  var self = this;

  var profileList = self.cache.get('seriesProfileList' + self.user.id);
  if (!profileList) {
    return self._sendMessage(new Error(i18n.__('errorSonarrWentWrong')));
  }

  var profile = _.filter(profileList, function(item) { return item.name === profileName; })[0];
  if (!profile) {
    return self._sendMessage(new Error(i18n.__('errorSonarrWentWrong')));
  }

  self.sonarr.get('rootfolder').then(function(result) {
    if (!result.length) {
      throw new Error(i18n.__("errorSonarrCouldntFindFolders"));
    }

    var folders = result;

    logger.info(i18n.__('logSonarrFolderListRequested', self.username));

    
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
    if(folders.length == 0) {
      logger.info('only one folder found, skipping selection');
      logger.info(folders[0].path);
      self.cache.set('seriesFolderId' + self.user.id, folders[0].path);
      SonarrMessage.prototype.searchForMovie.call(self, folders[0].path);
      return null;
    }

    self.cache.set('state' + self.user.id, state.sonarr.SEARCH_NOW);

    response.push(i18n.__('selectFromMenu'));

    logger.info(i18n.__('logSonarrFoundFolders', self.username, keyboardList.join(',')));

    return self._sendMessage(response.join('\n'), keyboardList);
  })
  .catch(function(error) {
    logger.info('something happened in this one');
    return self._sendMessage(error);
  });
};

SonarrMessage.prototype.searchForMovie = function(folderName) {
  var self = this;

  logger.info('running search for movie');

  var folderList = self.cache.get('seriesFolderList' + self.user.id);
  if (!folderList) {
    return self._sendMessage(new Error(i18n.__('errorSonarrWentWrong')));
  }

  var folder = _.filter(folderList, function(item) { return item.path === folderName; })[0];
  if (!folder) {
    return self._sendMessage(new Error(i18n.__('errorSonarrWentWrong')));
  }

  logger.info(i18n.__('logSonarrSeasonFoldersListRequested', self.username));

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

    logger.info(i18n.__('logSonarrFoundSeasonsFolderTypes', self.username, keyboardList.join(',')));


  self.cache.set('seriesFolderId' + self.user.id, folder.folderId);
  self.cache.set('seriesSearchForMovieList' + self.user.id, searchForMovieList);
  self.cache.set('state' + self.user.id, state.sonarr.ADD_SERIES);

  return self._sendMessage(response.join('\n'), keyboardList);
}; 


SonarrMessage.prototype.sendAddSeries = function(searchForMovie) {
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
    self._sendMessage(new Error(i18n.__('errorSonarrWentWrong')));
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

  logger.info(i18n.__("logSonarrSerieAddedWithOptions", self.username, series.title, JSON.stringify(postOpts)));
  console.log('send message to Radarr');

  self.sonarr.post('movie', postOpts).then(function(result) {
    logger.info(result);
    if (!result) {
      throw new Error(i18n.__("logSonarrSerieCantAdd"));
    }

    logger.info(i18n.__("logSonarrSerieAdded", self.username, series.title));

    if (self._isBotAdmin() && self.adminId !== self.user.id) {
      self.bot.sendMessage(self.user.id, i18n.__("botChatSonarrSerieAddedBy", series.title, self.username), {
        'selective': 2,
        'parse_mode': 'Markdown',
        'reply_markup': {
          'hide_keyboard': true
        }
      });
    }

    return self.bot.sendMessage(self.user.id, i18n.__("botChatSonarrSerieAdded", series.title), {
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
SonarrMessage.prototype._sendMessage = function(message, keyboard) {
  var self = this;
  keyboard = keyboard || null;

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

SonarrMessage.prototype._isBotAdmin = function() {
  if (this.adminId === this.user.id) {
    return true;
  }
  return false;
};

SonarrMessage.prototype._clearCache = function() {
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

module.exports = SonarrMessage;
