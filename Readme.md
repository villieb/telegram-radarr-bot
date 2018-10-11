# telegram-radarr-bot

Bot which lets you or others add series to [Radarr](https://radarr.video/) via the messaging service [Telegram](https://telegram.org/).

Contact [@BotFather](http://telegram.me/BotFather) on Telegram to create and get a bot token.

Getting Started
---------------

## Prerequisites
- [Node.js](http://nodejs.org)
- [Git](https://git-scm.com/downloads) (optional)

## Installation

```bash
# Clone the repository
git clone https://github.com/itsmegb/telegram-radarr-bot
```

```bash
# Install dependencies
cd telegram-radarr-bot
npm install
```

```bash
# Copy acl.json.template to acl.json
cp config/acl.json.template config/acl.json
```

```bash
# Copy config.json.template to config.json
cp config/config.json.template config/config.json
```

In `config.json` fill in the values below:

Telegram:
- **botToken** your Telegram Bot token

Bot:
- **password** the password to access the bot
- **owner** your Telegram user ID. (you can fill this in later)
- **notifyId** Telegram ID used for notifications. (optional; you can fill this in later)

Radarr:
- **hostname**: hostname where Radarr runs (required)
- **apiKey**: Your API to access Radarr (required)
- **port**: port number Radarr is listening on (optional, default: 7878)
- **urlBase**: URL Base of Radarr (optional, default: empty)
- **ssl**: Set to true if you are connecting via SSL (default: false)
- **username**: HTTP Auth username (default: empty)
- **password**: HTTP Auth password (default: empty)

**Important note**: Restart the bot after making any changes to the `config.json` file.

```bash
# Start the bot
node radarr.js
```

## Usage (commands)

### First use
Send the bot the `/auth` command with the password you created in `config.json`

You will then be presented with the bot help.

![radarr_bot_1](https://raw.githubusercontent.com/itsmegb/telegram-radarr-bot/master/examples/radarr_bot_1.png)


### Adding a series

Send the bot a message with the series name

`/q oldboy`

The bot will reply with

```
Found 3 movie(s):
1) Oldboy - 2013
2) Oldboy - 2003
3) Oldboy - 2009
```

Use the custom keyboard to select the series.

![radarr_bot_2](https://raw.githubusercontent.com/itsmegb/telegram-radarr-bot/master/examples/radarr_bot_2.png)

The bot will load the movie description and ask you to confirm that you've selected the correct one.

![radarr_bot_3](https://raw.githubusercontent.com/itsmegb/telegram-radarr-bot/master/examples/radarr_bot_3.png)

The bot will ask you for the quality, the profiles will be pulled from your Radarr instance.

```
Found 2 profiles:
1) Any
2) SD
3) HD-720p
4) HD-1080p
5) HD - 720p/1080p
```

Send the profile using the custom keyboard

![radarr_bot_4](https://raw.githubusercontent.com/itsmegb/telegram-radarr-bot/master/examples/radarr_bot_4.png)

If you have multiple storage paths, the bot will ask you where the path you want the movie to go.
If you only have one path, this step is skipped.

```
Found 2 folders:
1) /movies/
2) /movies2/
```

Send the folder using the custom keyboard

![radrr_bot_5](https://raw.githubusercontent.com/itsmegb/telegram-radarr-bot/master/examples/radarr_bot_5.png)


Lastly, the bot will ask you whether to perform an immediate search or not.

```
Would you like to search for the movie now?
1) Yes
2) No
```

Send the monitor type using the custom keyboard

![radarr_bot_6](https://raw.githubusercontent.com/itsmegb/telegram-radarr-bot/master/examples/radarr_bot_6.png)


If everything goes well, you'll see a text from the bot saying the series was added.

![radarr_bot_7](https://raw.githubusercontent.com/itsmegb/telegram-radarr-bot/master/examples/radarr_bot_7.png)




### Notifications - UNTESTED
Radarr can be setup to send notifications to a user or a group chat when new content is added.  

* In Radarr go to `Settings` > `Connect` > `+` > `Custom Script`
* In the Name field enter `Telegram`
* In the Path field enter the full path to your node.js installation i.e. `C:\Program Files\nodejs\node.exe`
* In the Arguments field enter the full path to `sonarr_notify.js` i.e `C:\bots\telegram-sonarr-bot\sonarr_notify.js`
* Start the bot by running `node radarr.js`
* Open a new chat or group chat with the bot and type `/cid`
* Note the Chat ID
* Open `config.json` and enter the Chat ID next to `notifyId`
* Restart the bot
* The specified chat will now begin receiving notifications for newly added content


### Additional commands
* `/upcoming [days]` shows upcoming movies, has a day parameter, defaults to 30 days
* `/library [movie]` search Radarr library for existing movies
* `/library` shows a list of all movies in the library *warning can be lots of output and potentially cause rate limiting*
* `/help` show available commands
* `/clear` clear all previous commands and cache

### Admin commands
* `/wanted` search all missing/wanted movies
* `/rss` perform an RSS Sync
* `/refresh` refreshes all movies
* `/users` list users
* `/revoke` revoke user from bot
* `/unrevoke` un-revoke user from bot
* `/cid` gets current chat id

## Docker
Alternatively you may use Docker to start the bot, when container is started, navigate to you /path/to/config and copy the config.json.template to config.json, edit it as required and restart the container.

```
docker run --name telegram-radarr-bot -d \
  --restart=always\
  -v /path/to/config:/config \
  telegram-radarr-bot
```

There is a pre-built Docker image here: https://hub.docker.com/r/itsmegb/telegram-radarr-bot/

## License
(The MIT License)

Copyright (c) 2015 Devin Buhl <devin.kray@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
