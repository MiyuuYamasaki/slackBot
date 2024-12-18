const { WebClient } = require('@slack/web-api');

// Slackのトークンを環境変数から取得
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CHANNEL_ID = 'C083QUBKU9L'; // 送信先のチャンネルID

// 日付のフォーマットを変更
function getFormattedDate() {
  const now = new Date();

  // 日本時間に合わせる（UTC + 9 時間）
  now.setHours(now.getHours() + 9);

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // 月は0から始まるので+1
  const day = String(now.getDate()).padStart(2, '0');

  // 曜日を取得（日本語）
  const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土'];
  const dayOfWeek = daysOfWeek[now.getDay()];

  return `${year}/${month}/${day}(${dayOfWeek})`; // 例: 2024/12/05(木)
}

// Slack Web APIクライアントを初期化
const client = new WebClient(SLACK_TOKEN);

// ボタン付きメッセージ
async function sendInteractiveMessage() {
  try {
    const formattedDate = getFormattedDate();
    const result = await client.chat.postMessage({
      channel: CHANNEL_ID,
      text: `業務連絡スレッド ${formattedDate}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `業務連絡スレッド ${formattedDate}`,
          },
        },
        {
          type: 'actions', // ボタンを含むブロック
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🏢 本社勤務',
                emoji: true,
              },
              action_id: 'button_office', // ボタンの識別子
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🏠 在宅勤務',
                emoji: true,
              },
              action_id: 'button_remote', // ボタンの識別子
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: `📋 一覧`,
                emoji: true,
              },
              action_id: 'button_list',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: `👋 退勤`,
                emoji: true,
              },
              action_id: 'button_goHome',
              style: 'danger',
            },
          ],
        },
      ],
    });
    console.log('Message sent: ', result.ts);
  } catch (error) {
    console.error('Error sending message: ', error);
  }
}

sendInteractiveMessage(); // ボタン付きメッセージ送信
