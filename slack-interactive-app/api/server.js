// 必要なモジュールをインポート
const express = require('express');
const { WebClient } = require('@slack/web-api');
const bodyParser = require('body-parser');

// 環境変数からSlackトークンを取得
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const client = new WebClient(SLACK_TOKEN);

// Expressサーバーのセットアップ
const app = express();
const port = process.env.PORT || 3000;

// ボディパーサーを使ってリクエストボディを解析
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ボタンが押されたときの処理
app.post('/slack/actions', async (req, res) => {
  try {
    // Slackのペイロードをパース
    const payload = JSON.parse(req.body.payload);

    // actionsやuserが存在するか確認
    if (!payload.actions || !payload.user) {
      console.error('Invalid payload structure:', payload);
      res.status(400).send('Bad Request: Invalid payload structure');
      return;
    }

    const action = payload.actions[0]?.action_id;
    const userName = payload.user?.name;

    let responseText = '';

    // 押されたボタンによって異なるレスポンスを設定
    if (action === 'button_office') {
      responseText = `${userName} さんが本社勤務を選択しました。`;
    } else if (action === 'button_remote') {
      responseText = `${userName} さんが在宅勤務を選択しました。`;
    } else {
      console.error('Unknown action_id:', action);
      res.status(400).send('Bad Request: Unknown action_id');
      return;
    }

    // Slackのスレッドにメッセージを送信
    await client.chat.postMessage({
      channel: payload.channel.id,
      thread_ts: payload.message.ts, // スレッドのタイムスタンプ
      text: responseText,
    });

    // 成功レスポンス
    res.status(200).send('Action received!');
  } catch (error) {
    console.error('Error posting message to Slack:', error);
    res.status(500).send(`Internal Server Error: ${error.message}`);
  }
});

// サーバーを起動
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
