/* global __dirname */

'use strict';

var RadarrAPI = require('sonarr-api');
var _ = require('lodash');
var moment = require('moment');

var i18n = require(__dirname + '/../lib/lang');
var config = require(__dirname + '/../lib/config');
var state = require(__dirname + '/../lib/state');
var logger = require(__dirname + '/../lib/logger');
var acl = require(__dirname + '/../lib/acl');

/*
 * initalize the class
 */
function RadarrMessage(bot, user, cache) {
    this.bot = bot;
    this.user = user;
    this.cache = cache;
    this.adminId = config.bot.owner;
    this.username = this.user.username || (this.user.first_name + (' ' + this.user.last_name || ''));

    this.radarr = new RadarrAPI({
        hostname: config.radarr.hostname,
        apiKey: config.radarr.apiKey,
        port: config.radarr.port,
        urlBase: config.radarr.urlBase,
        ssl: config.radarr.ssl,
        username: config.radarr.username,
        password: config.radarr.password
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
        logger.info(i18n.__('logRadarrAllSeries', self.username));
        _.sortBy(result, 'title');

        var response = [];
        _.forEach(result, function(n, key) {

            var movie = '[' + n.title + '](https://www.imdb.com/title/' + n.imdbId + ')' + (n.year ? ' - _' + n.year + '_' : '');
            // if a query was submitted, filter the results here
            if(query) {
                if(n.title.search(new RegExp(query, 'i')) !== -1) {
                    response.push(movie);
                }
            } else {
                response.push(movie);
            }
        });

        if(!response.length) {
            throw new Error(i18n.__('errorRadarrUnableToLocate', query));
        }

        response.sort();

        if(query) {
            // add title to begining of the array
            response.unshift(i18n.__('botChatRadarrMatchingResults'));
        }

        // If there are more than 50 results, split the messages
        if(response.length > 50) {
            var splitReponse = _.chunk(response, 50);
            splitReponse.sort();
            var i = 0;
            var libraryLoop = setInterval(function() {
                var n = splitReponse[i];
                if(n === undefined) {
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
            return self._sendMessage(error);
        });
};

RadarrMessage.prototype.performLibraryRefresh = function() {
    var self = this;

    logger.info(i18n.__('logRadarrRefreshCommandSent', self.username));

    self.radarr.post('command', {
            'name': 'RefreshMovie'
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
    var self = this;

    var fromDate = moment().toISOString();
    var toDate = moment().add(futureDays, 'day').toISOString();

    logger.info(i18n.__('logRadarrUpcomingCommandSent', self.username, fromDate, toDate));

    self.radarr.get('calendar', { 'start': fromDate, 'end': toDate })
        .then(function(episode) {
            if(!episode.length) {
                throw new Error(i18n.__('errorRadarrNothingInCalendar'));
            }

            var lastDate = null;
            var response = [];
            _.forEach(episode, function(n, key) {
                var done = (n.hasFile ? i18n.__('RadarrDone') : '');
                var niceDate = moment(n.physicalRelease).format("MMM Do YYYY");
                logger.info(niceDate);

                // Add an empty line to break list of multiple days
                // if(lastDate != null && n.airDate != lastDate) response.push(' ');
                response.push(niceDate + ' - ' + n.title + done);
                lastDate = n.airDate;
            });

            logger.info(i18n.__("logRadarrFoundMovies", self.username, response.join(',')));

            return self._sendMessage(response.join('\n'), []);
        })
        .catch(function(error) {
            return self._sendMessage(error);
        });
};


/*
 * handle the flow of adding a new series
 */
RadarrMessage.prototype.sendSeriesList = function(movieName) {
    var self = this;

    self.test = 'hello';

    logger.info(i18n.__('logRadarrQueryCommandSent', self.username));

    self.radarr.get('movie/lookup', { 'term': movieName }).then(function(result) {
            if(!result.length) {
                throw new Error(i18n.__('errorRadarrMovieNotFound', movieName));
            }

            var movies = result;

            logger.info(i18n.__('logRadarrUserMovieRequested', self.username, movieName));

            var movieList = [],
                keyboardList = [];

            movies.length = (movies.length > config.bot.maxResults ? config.bot.maxResults : movies.length);

            var response = [i18n.__('botChatRadarrFoundNMovies', movies.length)];

            _.forEach(movies, function(n, key) {

                var imageCover = null;
                _.forEach(n.images, function(image, index) {
                    if(image.coverType === 'poster') {
                        imageCover = image.url;
                    }
                });

                console.log(n);

                var id = key + 1;
                var keyboardValue = n.title + (n.year ? ' - ' + n.year : '');

                movieList.push({
                    'id': id,
                    'title': n.title,
                    'plot': n.overview,
                    'year': n.year,
                    'tmdbId': n.tmdbId,
                    'titleSlug': n.titleSlug,
                    'keyboardValue': keyboardValue,
                    'coverUrl': imageCover
                });

                keyboardList.push([keyboardValue]);

                response.push('➸ [' + keyboardValue + '](https://www.themoviedb.org/movie/' + n.tmdbId + ')');
            });

            response.push(i18n.__('selectFromMenu'));

            logger.info(i18n.__("logRadarrFoundMovies2", self.username, keyboardList.join(',')));

            // set cache
            self.cache.set('movieList' + self.user.id, movieList);
            self.cache.set('state' + self.user.id, state.radarr.CONFIRM);

            return self._sendMessage(response.join('\n'), keyboardList);
        })
        .catch(function(error) {
            return self._sendMessage(error);
        });
};

RadarrMessage.prototype.confirmMovieSelect = function(displayName) {
    var self = this;

    var movieList = self.cache.get('movieList' + self.user.id);

    if(!movieList) {
        return self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
    }

    var movie = _.filter(movieList, function(item) { return item.keyboardValue === displayName; })[0];
    if(!movie) {
        return self._sendMessage(new Error(i18n.__('botChatRadarrMovieNotFound', displayName)));
    }

    // use workflow to run async tasks
    var workflow = new(require('events').EventEmitter)();

    // check for existing movie in radarr
    workflow.on('checkRadarrMovie', function() {
        self.radarr.get('movie').then(function(result) {
            logger.info(i18n.__('logRadarrLookingForExistingMovie', self.username));

            var existingMovie = _.filter(result, function(item) { return item.tmdbId === movie.tmdbId; })[0];
            if(existingMovie) {
                throw new Error(i18n.__('errorRadarrMovieAlreadyTracked'));
            } else {
                workflow.emit('confirmMovie');
            }
        }).catch(function(error) {
            return self._sendMessage(error);
        });
    });

    workflow.on('confirmMovie', function() {
        self.radarr.get('movie').then(function(result) {
            logger.info(i18n.__('logRadarrConfirmCorrectMovie', movie.keyboardValue, self.username));

            var keyboardList = [
                [i18n.__('globalYes')],
                [i18n.__('globalNo')]
            ];

            var response = ['*' + movie.title + ' (' + movie.year + ')*\n'];

            response.push(movie.plot + '\n');
            response.push(i18n.__('botChatRadarrIsMovieCorrect'));

            // Add cover to message (if available)
            if(movie.coverUrl !== null) {
                response.push('\n[Poster!](' + movie.coverUrl + ')');
            }

            // set cache
            self.cache.set('state' + self.user.id, state.radarr.PROFILE);
            self.cache.set('movieId' + self.user.id, movie.id);

            return self._sendMessage(response.join('\n'), keyboardList);

        }).catch(function(error) {
            return self._sendMessage(error);
        });
    });

    /**
     * Initiate the workflow
     */
    workflow.emit('checkRadarrMovie');
};

RadarrMessage.prototype.sendProfileList = function(displayName) {
    var self = this;

    var movieId = self.cache.get('movieId' + self.user.id);

    if(!movieId) {
        return self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
    }

    if(displayName == 'No') {
        return self._sendMessage(new Error(i18n.__('globalAborted')));
    }

    // use workflow to run async tasks
    var workflow = new(require('events').EventEmitter)();

    // get the radarr profiles
    workflow.on('getRadarrProfiles', function() {
        self.radarr.get('profile').then(function(result) {
                if(!result.length) {
                    throw new Error(i18n.__('errorRadarrCouldntGetProfile'));
                }

                var profiles = result;

                logger.info(i18n.__('logRadarrProfileListRequested', self.username));

                var profileList = [],
                    keyboardList = [],
                    keyboardRow = [];
                var response = ['*Found ' + profiles.length + ' profiles*'];
                _.forEach(profiles, function(n, key) {

                    profileList.push({ 'name': n.name, 'profileId': n.id });
                    response.push('➸ ' + n.name);

                    // Profile names are short, put two on each custom
                    // keyboard row to reduce scrolling
                    keyboardRow.push(n.name);
                    if(keyboardRow.length === 2) {
                        keyboardList.push(keyboardRow);
                        keyboardRow = [];
                    }
                });

                if(keyboardRow.length === 1) {
                    keyboardList.push([keyboardRow[0]]);
                }

                response.push(i18n.__('selectFromMenu'));

                logger.info(i18n.__('logRadarrFoundProfile', self.username, keyboardList.join(',')));

                // set cache
                self.cache.set('state' + self.user.id, state.radarr.FOLDER);
                self.cache.set('moviesProfileList' + self.user.id, profileList);

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

    var profileList = self.cache.get('moviesProfileList' + self.user.id);
    if(!profileList) {
        return self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
    }

    var profile = _.filter(profileList, function(item) { return item.name === profileName; })[0];
    if(!profile) {
        return self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
    }

    self.radarr.get('rootfolder').then(function(result) {
            if(!result.length) {
                throw new Error(i18n.__("errorRadarrCouldntFindFolders"));
            }

            var folders = result;

            logger.info(i18n.__('logRadarrFolderListRequested', self.username));

            var folderList = [],
                keyboardList = [];
            var response = ['*Found ' + folders.length + ' folders*'];
            _.forEach(folders, function(n, key) {
                folderList.push({ 'path': n.path, 'folderId': n.id });
                response.push('➸ ' + n.path);
                keyboardList.push([n.path]);
            });

            // set cache
            self.cache.set('moviesProfileId' + self.user.id, profile.profileId);
            self.cache.set('moviesFolderList' + self.user.id, folderList);

            self.cache.set('state' + self.user.id, state.radarr.SEARCH_NOW);

            // if only 1 folder found skip folder selection
            if(folders.length == 1) {
                logger.info('only one folder found, skipping selection');
                logger.info(folders[0].path);
                self.cache.set('moviesFolderId' + self.user.id, folders[0].path);
                RadarrMessage.prototype.searchForMovie.call(self, folders[0].path);
                return null;
            }

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

    var folderList = self.cache.get('moviesFolderList' + self.user.id);
    if(!folderList) {
        return self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
    }

    var folder = _.filter(folderList, function(item) { return item.path === folderName; })[0];
    if(!folder) {
        return self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
    }

    var searchForMovie = [i18n.__('globalYes'), i18n.__('globalNo')];
    var searchForMovieList = [],
        keyboardList = [],
        keyboardRow = [];
    var response = [i18n.__('searchForMovieNow')];
    _.forEach(searchForMovie, function(n, key) {
        searchForMovieList.push({ 'type': n });
        response.push('➸ ' + n);
        keyboardRow.push(n);
        if(keyboardRow.length === 2) {
            keyboardList.push(keyboardRow);
            keyboardRow = [];
        }
    });

    if(keyboardRow.length === 1) {
        keyboardList.push([keyboardRow[0]]);
    }

    response.push(i18n.__('selectFromMenu'));

    self.cache.set('moviesFolderId' + self.user.id, folder.folderId);
    self.cache.set('searchForMovieList' + self.user.id, searchForMovieList);
    self.cache.set('state' + self.user.id, state.radarr.ADD_MOVIE);
    return self._sendMessage(response.join('\n'), keyboardList);
};


RadarrMessage.prototype.sendAddMovie = function(searchForMovie) {
    var self = this;

    var movieId = self.cache.get('movieId' + self.user.id);
    var movieList = self.cache.get('movieList' + self.user.id);
    var profileId = self.cache.get('moviesProfileId' + self.user.id);
    var profileList = self.cache.get('moviesProfileList' + self.user.id);
    var folderId = self.cache.get('moviesFolderId' + self.user.id);
    var folderList = self.cache.get('moviesFolderList' + self.user.id);
    var searchMovieId = searchForMovie;
    var searchForMovieList = self.cache.get('searchForMovieList' + self.user.id);

    if(!searchForMovieList) {
        console.log('searchForMovieList was not found');
        self._sendMessage(new Error(i18n.__('errorRadarrWentWrong')));
    }

    var movie = _.filter(movieList, function(item) { return item.id === movieId; })[0];
    var profile = _.filter(profileList, function(item) { return item.profileId === profileId; })[0];
    var folder = _.filter(folderList, function(item) { return item.folderId === folderId; })[0];
    var search = _.filter(searchForMovieList, function(item) { return item.type === searchMovieId; })[0];

    var postOpts = {};
    var addOptions = {};

    postOpts.tmdbId = movie.tmdbId;
    postOpts.title = movie.title;
    postOpts.titleSlug = movie.titleSlug;
    postOpts.rootFolderPath = folder.path;
    postOpts.year = movie.year;
    postOpts.monitored = true;
    postOpts.qualityProfileId = profile.profileId;
    postOpts.images = [];

    addOptions.searchForMovie = (search.type === i18n.__("globalYes") ? true : false);
    postOpts.addOptions = addOptions;

    logger.info(i18n.__("logRadarrMovieAddedWithOptions", self.username, movie.title, JSON.stringify(postOpts)));
    console.log('send message to Radarr');

    self.radarr.post('movie', postOpts).then(function(result) {
            logger.info(result);
            if(!result) {
                throw new Error(i18n.__("logRadarrMovieCantAdd"));
            }

            logger.info(i18n.__("logRadarrMovieAdded", self.username, movie.title));

            if(self._isBotAdmin() && self.adminId !== self.user.id) {
                self.bot.sendMessage(self.user.id, i18n.__("botChatRadarrMovieAddedBy", movie.title, self.username), {
                    'selective': 2,
                    'parse_mode': 'Markdown',
                    'reply_markup': {
                        'hide_keyboard': true
                    }
                });
            }

            return self.bot.sendMessage(self.user.id, i18n.__("botChatRadarrMovieAdded", movie.title), {
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
    if(message instanceof Error) {
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
            'reply_markup': JSON.stringify({ keyboard: keyboard, one_time_keyboard: true })
        };
    }

    return self.bot.sendMessage(self.user.id, message, options);
};

RadarrMessage.prototype._isBotAdmin = function() {
    if(this.adminId === this.user.id) {
        return true;
    }
    return false;
};

RadarrMessage.prototype._clearCache = function() {
    var self = this;

    logger.info(i18n.__("logClearCache", self.username));

    var cacheItems = [
        'movieId', 'movieList', 'moviesProfileId',
        'moviesProfileList', 'moviesFolderId', 'moviesFolderList',
        'searchForMovieList', 'state'
    ];

    return _(cacheItems).forEach(function(item) {
        self.cache.del(item + self.user.id);
    });
};

module.exports = RadarrMessage;
