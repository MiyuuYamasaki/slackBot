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

// ボタンが押されたときの処理
app.post('/slack/actions', async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload); // Slackのpayloadを解析

    //// デバッグ用 ： Payload内容確認時は下記コメントアウト外してください。
    // console.log('Payload:', JSON.stringify(payload, null, 2));

    if (payload.actions && payload.actions.length > 0) {
      // 必要情報を取得
      const action = payload.actions[0].action_id;
      const userId = payload.user?.name;
      const messageText = payload.message?.text;
      let modalView;

      if (action === 'button_add') {
        // User情報のモーダルビューを表示
        await handleUserModal(payload, messageText);
      } else {
        // メインメッセージから日付を取得
        const ymdMatch = messageText.match(/(\d{4}\/\d{2}\/\d{2})/);
        const ymd = ymdMatch[1].replace(/\//g, '-'); // "2024/12/10" -> "2024-12-10" に変換
        const todaysDateString = getTodaysDate(); // 現在の日付を取得

        // 当日以外の場合アクションを行わない
        if (todaysDateString != ymd) {
          errorYmdMarch(payload, modalView);
          return;
        }

        try {
          if (action === 'button_list') {
            // 一覧表示
            await handleCreateList(payload, modalView, ymd);
          } else if (action === 'button_office' || action === 'button_remote') {
            // DB更新
            await handleWorkStyleChange(payload, action, userId, ymd);
          } else if (action === 'button_goHome') {
            // 退勤チェック
            await handleGoHome(payload, userId, ymd);
          }

          // レスポンスを返す
          res.status(200).send();
        } catch (e) {
          console.log(action + '時にエラーが発生しました：' + e);
          res.status(400).send();
        }
      }
    } else {
      try {
        // スレッドボタン押下時
        const callbackId = payload.view?.callback_id;

        // UserをDBへ追加
        if (callbackId === 'add_user_modal') await handleAddUser(payload);
        res.status(200).send();
      } catch (e) {
        console.log(action + '時にエラーが発生しました：' + e);
        res.status(400).send();
      }
    }
  } catch (error) {
    console.error('Error handling action:', error);
    res.status(500).send('Internal Server Error');
  }
});

// サーバーを起動
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// 当日日付取得用の関数
function getTodaysDate() {
  const now = new Date();

  // 日本時間に合わせる（UTC + 9 時間）
  now.setHours(now.getHours() + 9);

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // 月は0から始まるため、+1して0埋め
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// User情報入力モーダルを表示
async function handleUserModal(payload, messageText) {
  console.log('▼ handleUserModal start');

  // メッセージから #タグ内のUserID を抽出
  const userIdMatch = messageText.match(/#([^#]+)#/);
  const extractedUserId = userIdMatch ? userIdMatch[1] : '';

  // ユーザー情報を入力させるモーダルウィンドウの構築と表示
  await client.views.open({
    trigger_id: payload.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'add_user_modal',
      private_metadata: JSON.stringify({
        channel_id: payload.channel.id,
        message_ts: payload.container.message_ts,
      }),
      title: {
        type: 'plain_text',
        text: 'ユーザー情報を入力',
      },
      blocks: [
        {
          type: 'input',
          block_id: 'user_id_block',
          element: {
            type: 'plain_text_input',
            action_id: 'user_id_input',
            initial_value: extractedUserId, // 初期値
            placeholder: {
              type: 'plain_text',
              text: 'ユーザーIDを入力',
            },
          },
          label: {
            type: 'plain_text',
            text: 'ユーザーID',
          },
        },
        {
          type: 'input',
          block_id: 'user_name_block',
          element: {
            type: 'plain_text_input',
            action_id: 'user_name_input',
            placeholder: {
              type: 'plain_text',
              text: 'ユーザー名を入力 例：東京 太郎',
            },
          },
          label: {
            type: 'plain_text',
            text: 'ユーザー名',
          },
        },
      ],
      submit: {
        type: 'plain_text',
        text: '追加',
      },
    },
  });

  console.log('▲ handleUserModal end');
}

// 画面日付と当日日付がアンマッチの場合
async function errorYmdMarch(payload, modalView) {
  modalView = {
    type: 'modal',
    title: {
      type: 'plain_text',
      text: 'エラー 😢',
      emoji: true,
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '当日データ以外の参照・変更はできません。',
        },
      },
    ],
  };

  // モーダルウィンドウを開く
  await client.views.open({
    trigger_id: payload.trigger_id,
    view: modalView,
  });
}

// 一覧ボタンクリック時
async function handleCreateList(payload, modalView, ymd) {
  console.log('▼ handleCreateList start');

  // クエリを実行してデータを取得
  const { data: records } = await supabase.rpc('custom_query');

  // データを分類
  const officeUsers =
    records
      .filter((record) => record.work_style === 'office')
      .map((record) => {
        // leaveCheckが奇数の場合に「退勤済」を追加
        return `<@${record.user_name}>${
          record.leave_check % 2 !== 0 ? ' (退勤済)' : ''
        }`;
      })
      .join('\n') || 'なし';

  const remoteUsers =
    records
      .filter((record) => record.work_style === 'remote')
      .map((record) => {
        return `<@${record.user_name}>${
          record.leave_check % 2 !== 0 ? ' (退勤済)' : ''
        }`;
      })
      .join('\n') || 'なし';

  const vacationUsers =
    records
      .filter((record) => record.work_style === '休暇')
      .map((record) => {
        return `<@${record.user_name}>${
          record.leave_check % 2 !== 0 ? ' (退勤済)' : ''
        }`;
      })
      .join('\n') || 'なし';

  // 一覧表示のモーダルウィンドウを作成
  modalView = {
    type: 'modal',
    callback_id: 'work_status_modal',
    title: {
      type: 'plain_text',
      text: `${ymd} 勤務状況一覧`,
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🏢 *本社勤務:*\n${officeUsers}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🏠 *在宅勤務:*\n${remoteUsers}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `💤 *休暇(回答無):*\n${vacationUsers}`,
        },
      },
    ],
  };

  // モーダルウィンドウを開く
  await client.views.open({
    trigger_id: payload.trigger_id,
    view: modalView,
  });
  console.log('▲ handleCreateList end');
}

// 本社・在宅ボタン処理
async function handleWorkStyleChange(payload, action, userId) {
  console.log('▼ handleWorkStyleChange start');

  const workStyle = action === 'button_office' ? 'office' : 'remote';

  // 既にデータが存在するか確認
  const { data: existingRecord, error } = await supabase.rpc('get_query', {
    userid: String(userId),
  });

  if (error) {
    console.error('Error executing RPC:', error);
    throw error;
  }

  // ユーザが存在しない場合スレッドへ送信
  if (!existingRecord[0].code === userId) {
    infoUsers(payload, userId);
  }

  // 並列処理の準備
  const tasks = [];

  if (!existingRecord || existingRecord.length === 0) {
    // レコードが存在しない場合はINSERT
    tasks.push(
      supabase
        .from('Record')
        .insert([
          {
            ymd,
            user_id: userId,
            workStyle: workStyle,
            leaveCheck: 0,
          },
        ])
        .then(({ error }) => {
          if (error) throw error;
          console.log('Inserted new record for', userId);
        })
    );
  } else if (existingRecord[0].work_style !== workStyle) {
    // workStyleが異なる場合はUPDATE
    tasks.push(
      supabase
        .from('Record')
        .update({ workStyle: workStyle })
        .eq('id', existingRecord[0].record_id)
        .then(({ error }) => {
          if (error) throw error;
          console.log('Updated record for', userId);
        })
    );
  }

  // 2024.12.18 miyu 反映にラグが出るため、ボタンのカウントを削除
  // DBから最新の人数を取得
  // const { data: records } = await supabase.rpc('count_query');
  // let officeCount;
  // let remoteCount;
  // records.forEach((row) => {
  //   if (row.workstyle === 'office') {
  //     officeCount = row.countstyle || 0;
  //   } else if (row.workstyle === 'remote') {
  //     remoteCount = row.countstyle || 0;
  //   }
  // });

  // メッセージ更新処理を並列タスクに追加
  tasks.push(
    (async () => {
      const channel = payload.channel.id;
      const ts = payload.message.ts;
      const messageText = payload.message?.text;
      const options = {
        existingRecord: { workStyle: workStyle },
        leaveCheck: existingRecord[0]?.leave_check || 0,
      };

      try {
        await updateMessage(client, channel, ts, messageText, options);
      } catch (error) {
        console.error('Failed to update message:', error);
      }
    })()
  );

  // 並列タスクを実行
  try {
    await Promise.all(tasks);
    console.log('All tasks completed successfully.');
  } catch (error) {
    console.error('Error in one of the tasks:', error);
  }

  console.log('▲ handleWorkStyleChange end');
}

// ユーザコードをスレッドに送信
async function infoUsers(payload, userId) {
  console.log('▼ infoUsers start');

  let responseText = `*#${userId}#* さんのデータが存在しません。追加しますか？`;

  await client.chat.postMessage({
    channel: payload.channel.id,
    thread_ts: payload.message.ts,
    text: responseText,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: responseText,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '追加',
              emoji: true,
            },
            action_id: 'button_add',
            style: 'primary',
          },
        ],
      },
    ],
  });
  console.log('▲ infoUsers end');
}

// 退勤ボタン処理
async function handleGoHome(payload, userId, ymd) {
  console.log('▼ handleGoHome start');

  // 退勤状態のトグル
  const { data: record } = await supabase
    .from('Record')
    .select('*')
    .eq('ymd', ymd)
    .eq('user_id', userId)
    .single();

  let leave_check = (record.leaveCheck || 0) + 1;

  (async () => {
    const tasks = [];

    // leaveCheckの更新
    tasks.push(
      supabase
        .from('Record')
        .update({ leaveCheck: leave_check })
        .eq('id', record.id)
        .then(({ error }) => {
          if (error) throw error;
          console.log('Updated leaveCheck for record ID:', record.id);
        })
    );

    // DBから最新の人数を取得（必要ならアンコメント）
    /*
    tasks.push(
      supabase.rpc('count_query').then(({ data: records, error }) => {
        if (error) throw error;
  
        let officeCount = 0;
        let remoteCount = 0;
  
        records.forEach((row) => {
          if (row.workstyle === 'office') {
            officeCount = row.countstyle || 0;
          } else if (row.workstyle === 'remote') {
            remoteCount = row.countstyle || 0;
          }
        });
  
        console.log('Office Count:', officeCount, 'Remote Count:', remoteCount);
        return { officeCount, remoteCount };
      })
    );
    */

    // Slackメッセージ更新
    tasks.push(
      (async () => {
        const channel = payload.channel.id;
        const ts = payload.message.ts;
        const messageText = payload.message?.text;

        const options = {
          // officeCount: officeCount, // 必要なら有効化
          // remoteCount: remoteCount, // 必要なら有効化
          existingRecord: { workStyle: record.workStyle },
          leaveCheck: leave_check,
        };

        try {
          await updateMessage(client, channel, ts, messageText, options);
          console.log('Slack message updated.');
        } catch (error) {
          console.error('Failed to update Slack message:', error);
        }
      })()
    );

    // 並列タスク実行
    try {
      await Promise.all(tasks);
      console.log('All tasks completed successfully.');
    } catch (error) {
      console.error('Error in one of the tasks:', error);
    }
  })();

  console.log('▲ handleGoHome end');
}

// User追加処理
async function handleAddUser(payload) {
  console.log('▼ handleAddUser start');
  // モーダルから入力された値を取得
  const userId = payload.view.state.values.user_id_block.user_id_input.value;
  const userName =
    payload.view.state.values.user_name_block.user_name_input.value;

  if (!userId || !userName) {
    console.error('UserID or UserName is missing');
    return res.status(400).send('Invalid input');
  }

  const { data: users } = await supabase
    .from('Users')
    .select('*')
    .eq('code', userId)
    .single();

  if (!users) {
    // Supabaseにデータを追加
    const { error } = await supabase.from('Users').insert([
      {
        code: userId,
        name: userName,
      },
    ]);

    if (error) {
      console.error('Error adding user to Users table:', error);
      return res.status(500).send('Failed to add user');
    }

    message = `*${userName}* さんのデータを追加しました！`;

    console.log('User added successfully');
  } else {
    message = `*#${userId}#* さんのデータは既に存在しています。`;
  }

  console.log(message);

  // モーダルを開いた際に保存したチャンネル情報を取得
  const privateMetadata = JSON.parse(payload.view.private_metadata || '{}');
  const channelId = privateMetadata.channel_id;
  const messageTs = privateMetadata.message_ts;

  if (!channelId || !messageTs) {
    console.error('Channel ID or Message TS is missing');
    return res.status(400).send('Channel or message reference missing');
  }

  //メッセージを更新
  await client.chat.update({
    channel: channelId,
    ts: messageTs,
    text: message,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      },
    ],
  });
  console.log('▲ handleAddUser end');
}
