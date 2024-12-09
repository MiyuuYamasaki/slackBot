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
    // ペイロードをJSONとしてパース
    const payload = JSON.parse(req.body.payload);

    // アクションの情報を取得
    const action = payload.actions[0].action_id;
    const userName = payload.user.username; // Slackユーザー名
    const channelId = payload.channel.id; // チャンネルID
    const messageTs = payload.message.ts; // スレッドのタイムスタンプ

    let responseText = '';

    // アクションIDによる処理の分岐
    if (action === 'button_office') {
      responseText = `${userName} さんが本社勤務を選択しました。`;
    } else if (action === 'button_remote') {
      responseText = `${userName} さんが在宅勤務を選択しました。`;
    }

    // Slackにスレッド返信を送信
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: messageTs,
      text: responseText,
    });

    // Slackに成功レスポンスを返す
    res.status(200).send();
  } catch (error) {
    console.error('エラー:', error);
    res.status(500).send('Internal Server Error');
  }
});

// サーバーを起動
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
