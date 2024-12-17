const express = require('express');
const { WebClient } = require('@slack/web-api');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const { updateMessage } = require('./updateMessage');

// 環境変数の設定
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// クライアントの初期化
const client = new WebClient(SLACK_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expressサーバーのセットアップ
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 当日日付取得用の関数
function getTodaysDate() {
  const now = new Date();
  now.setHours(now.getHours() + 9);
  return now.toISOString().split('T')[0];
}

// ボタンが押されたときの処理
app.post('/slack/actions', (req, res) => {
  exports.lambdaHandler = async (event, context, callback) => {
    // 何よりもまず Slack にレスポンスを返す
    callback(null, { statusCode: 200, body: '' });
    // 以降は普通に処理続行
    // some codes...

    try {
      const payload = JSON.parse(req.body.payload);

      // console.log('Received payload:', JSON.stringify(payload, null, 2));

      // res.status(200).send(); // 先にレスポンスを返す

      if (!payload.actions || payload.actions.length === 0) return;

      const action = payload.actions[0].action_id;
      const userId = payload.user?.name;
      const messageText = payload.message?.text;

      if (['button_office', 'button_remote'].includes(action)) {
        handleWorkStyleChange(payload, action, messageText, userId);
      } else if (action === 'button_goHome') {
        handleGoHome(payload, messageText, userId);
      }
    } catch (error) {
      console.error('Error handling action:', error);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({}),
    };
  };
});

// 本社・在宅ボタン処理
async function handleWorkStyleChange(payload, action, messageText, userId) {
  console.log('▼ handleWorkStyleChange start');
  const ymd = extractDateFromMessage(messageText);
  if (!isToday(ymd)) return;

  const workStyle = action === 'button_office' ? 'office' : 'remote';
  await supabase.from('Record').upsert([{ ymd, user_id: userId, workStyle }]);
  console.log(`WorkStyle updated for ${userId}: ${workStyle}`);

  // DBから最新の人数を取得
  const { data: records } = await supabase.rpc('custom_query');
  const officeCount = records.filter((r) => r.work_style === 'office').length;
  const remoteCount = records.filter((r) => r.work_style === 'remote').length;

  // Slackメッセージ更新
  await updateMessage(
    client,
    payload.channel.id,
    payload.container.message_ts,
    messageText,
    {
      officeCount,
      remoteCount,
      existingRecord: { workStyle },
    }
  );

  console.log('▲ handleWorkStyleChange end');
}

// 退勤ボタン処理
async function handleGoHome(payload, messageText, userId) {
  console.log('▼ handleGoHome start');
  const ymd = extractDateFromMessage(messageText);
  if (!isToday(ymd)) return;

  // 退勤状態のトグル
  const { data: record } = await supabase
    .from('Record')
    .select('leave_check')
    .eq('ymd', ymd)
    .eq('user_id', userId)
    .single();

  const leaveCheck = record ? (record.leave_check + 1) % 2 : 1;
  await supabase
    .from('Record')
    .upsert([{ ymd, user_id: userId, leave_check: leaveCheck }]);

  // DBから最新の人数を取得
  const { data: records } = await supabase.rpc('custom_query');
  const officeCount = records.filter((r) => r.work_style === 'office').length;
  const remoteCount = records.filter((r) => r.work_style === 'remote').length;

  // Slackメッセージ更新
  await updateMessage(
    client,
    payload.channel.id,
    payload.container.message_ts,
    messageText,
    {
      officeCount,
      remoteCount,
      leaveCheck,
    }
  );

  console.log('▲ handleGoHome end');
}

// メッセージ内の日付を取得
function extractDateFromMessage(text) {
  const match = text.match(/(\d{4}\/\d{2}\/\d{2})/);
  return match ? match[1].replace(/\//g, '-') : null;
}

// 今日の日付かチェック
function isToday(date) {
  return date === getTodaysDate();
}

// サーバーを起動
app.listen(port, () => console.log(`Server is running on port ${port}`));
