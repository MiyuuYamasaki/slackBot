const express = require('express');
const { WebClient } = require('@slack/web-api');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');

// 環境変数の設定
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; // anon key

// クライアントの初期化
const client = new WebClient(SLACK_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); // anon keyを使用

// Expressサーバーのセットアップ
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

function getTodaysDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // 月は0から始まるため、+1して0埋め
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ボタンが押されたときの処理
app.post('/slack/actions', async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload); // Slackのpayloadを解析
    console.log('Payload:', JSON.stringify(payload, null, 2)); // デバッグ用

    if (payload.actions && payload.actions.length > 0) {
      //アクションを取得
      const action = payload.actions[0].action_id;

      const userId = payload.user?.name;

      // 内容を取得
      const messageText = payload.message?.text;

      // `button_add` のアクションに対応
      if (action === 'button_add') {
        console.log('▼ usersAdd action start');

        // メッセージから #タグ内のUserID を抽出
        const userIdMatch = messageText.match(/#([^#]+)#/);
        const extractedUserId = userIdMatch ? userIdMatch[1] : '';
        console.log('Extracted UserID:', extractedUserId);

        // モーダルウィンドウの構築と表示
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
                  initial_value: extractedUserId,
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

        console.log('▲ usersAdd action end');
      } else {
        const ymdMatch = messageText.match(/(\d{4}\/\d{2}\/\d{2})/);
        if (!ymdMatch) {
          console.error('Date not found in message text:', messageText);
          return;
        }

        const ymd = ymdMatch[1].replace(/\//g, '-'); // "2024/12/10" -> "2024-12-10" に変換
        const todaysDateString = getTodaysDate();

        if (todaysDateString === ymd) {
          // 当日データ以外は参照・変更を行わない。
          // 一覧ボタンクリック時
          if (action === 'button_list') {
            try {
              console.log('▼ createList action start');

              // クエリを実行してデータを取得
              const { data: records, error: queryError } = await supabase.rpc(
                'custom_query'
              );

              if (queryError) {
                console.error('Error fetching records:', queryError);
                throw queryError;
              }

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

              // モーダルビューの構築
              modalView = {
                type: 'modal',
                callback_id: 'work_status_modal',
                title: {
                  type: 'plain_text',
                  text: `${ymd} 勤務状況一覧`,
                },
                close: {
                  type: 'plain_text',
                  text: '閉じる',
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
              console.log('▲ createList action end');
            } catch (error) {
              console.log(action + '時にエラーが発生しました:' + error);
            }
          }

          // 本社勤務・在宅勤務ボタンクリック時
          if (action === 'button_office' || action === 'button_remote') {
            try {
              console.log('▼ dateSet action start');

              // Userが存在するか確認
              const { data: userDate, error: Error } = await supabase
                .from('Users')
                .select('*')
                .eq('code', userId)
                .single();

              if (Error && Error.code !== 'PGRST116') {
                throw Error;
              }

              if (!userDate) {
                let responseText = `#${userId}#さんがUsersテーブルに存在しません。追加しますか？`;
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
              } else {
                console.log('Hello.' + userDate.name + 'さん');
              }

              let workStyle = null;
              if (action === 'button_office') workStyle = 'office';
              if (action === 'button_remote') workStyle = 'remote';

              // Supabaseにデータを保存/更新
              const { data: existingRecord, error: fetchError } = await supabase
                .from('Record')
                .select('*')
                .eq('ymd', ymd)
                .eq('user_id', userId)
                .single();

              if (fetchError && fetchError.code !== 'PGRST116') {
                throw fetchError;
              }

              // 未退勤、レコードが存在しない場合は更新・作成

              if (!existingRecord) {
                // レコードが存在しない場合はINSERT
                const { error: insertError } = await supabase
                  .from('Record')
                  .insert([{ ymd, user_id: userId, workStyle: workStyle }]);

                if (insertError) throw insertError;
                console.log('Inserted new record for', userId);
              } else {
                // workStyleが異なり、未退勤の場合はUPDATE
                if (
                  existingRecord.workStyle !== workStyle &&
                  (existingRecord.leaveCheck % 2 === 0 ||
                    existingRecord.leaveCheck === 0)
                ) {
                  const { error: updateError } = await supabase
                    .from('Record')
                    .update({ workStyle: workStyle })
                    .eq('id', existingRecord.id);

                  if (updateError) throw updateError;
                  console.log('Updated record for', userId);
                } else {
                  // 同じworkStyleの場合は変更なし
                  console.log('No change needed, already selected', workStyle);
                }
              }

              // クエリを実行して変更後のデータを取得
              const { data: records, error: queryError } = await supabase.rpc(
                'custom_query'
              );

              if (queryError) {
                console.error('Error fetching records:', queryError);
                throw queryError;
              }

              console.log('leave_check:' + existingRecord.leaveCheck);

              // 未退勤の場合はメッセージ更新
              if (
                !existingRecord || // 新規レコード
                existingRecord.leaveCheck % 2 === 0 ||
                existingRecord.leaveCheck === 0
              ) {
                // 各勤務場所の人数を集計
                const officeCount = records.filter(
                  (record) => record.work_style === 'office'
                ).length;
                const remoteCount = records.filter(
                  (record) => record.work_style === 'remote'
                ).length;

                console.log(
                  'office:remote = ' + officeCount + ':' + remoteCount
                );

                // メッセージを更新
                await client.chat.update({
                  channel: payload.channel.id,
                  ts: payload.message.ts,
                  text: messageText, // 元のメッセージを保持
                  blocks: [
                    {
                      type: 'section',
                      text: {
                        type: 'mrkdwn',
                        text: messageText,
                      },
                    },
                    {
                      type: 'actions',
                      elements: [
                        {
                          type: 'button',
                          text: {
                            type: 'plain_text',
                            text: `🏢 本社勤務 (${officeCount})`,
                            emoji: true,
                          },
                          action_id: 'button_office',
                          style: workStyle === 'office' ? 'primary' : undefined,
                        },
                        {
                          type: 'button',
                          text: {
                            type: 'plain_text',
                            text: `🏠 在宅勤務 (${remoteCount})`,
                            emoji: true,
                          },
                          action_id: 'button_remote',
                          style: workStyle === 'remote' ? 'primary' : undefined,
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
                        },
                      ],
                    },
                  ],
                });
              } else {
                // モーダルウィンドウの構築
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
                        text: '既に退勤済みです。',
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

              console.log('▲ dateSet action end');
            } catch (error) {
              console.log(action + '時にエラーが発生しました:' + error);
            }
          }

          // 退勤ボタンクリック時
          if (action === 'button_goHome') {
            try {
              console.log('▼ goHome action start');

              // Supabaseにデータを保存/更新
              const { data: existingRecord, error: fetchError } = await supabase
                .from('Record')
                .select('*')
                .eq('ymd', ymd)
                .eq('user_id', userId)
                .single();

              if (fetchError && fetchError.code === 'PGRST116') {
                console.log('No existing record. No update necessary.');
                return;
              } else if (fetchError) {
                throw fetchError;
              }

              let leaveCheck = (existingRecord.leaveCheck || 0) + 1;

              // クエリを実行してデータを取得
              const { data: records, error: queryError } = await supabase.rpc(
                'custom_query'
              );

              if (queryError) {
                console.error('Error fetching records:', queryError);
                throw queryError;
              }

              // 各勤務場所の人数を集計
              const officeCount = records.filter(
                (record) => record.work_style === 'office'
              ).length;
              const remoteCount = records.filter(
                (record) => record.work_style === 'remote'
              ).length;

              // leaveCheck更新
              const { error: updateError } = await supabase
                .from('Record')
                .update({ leaveCheck: leaveCheck })
                .eq('id', existingRecord.id);

              if (updateError) throw updateError;

              console.log('Updated record for userId:', userId);

              // メッセージの更新
              await client.chat.update({
                channel: payload.channel.id,
                ts: payload.message.ts,
                text: messageText,
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: messageText,
                    },
                  },
                  {
                    type: 'actions',
                    elements: [
                      {
                        type: 'button',
                        text: {
                          type: 'plain_text',
                          text: `🏢 本社勤務 (${officeCount})`,
                          emoji: true,
                        },
                        action_id: 'button_office',
                        style:
                          existingRecord &&
                          existingRecord.workStyle === 'office'
                            ? 'primary'
                            : undefined,
                      },
                      {
                        type: 'button',
                        text: {
                          type: 'plain_text',
                          text: `🏠 在宅勤務 (${remoteCount})`,
                          emoji: true,
                        },
                        action_id: 'button_remote',
                        style:
                          existingRecord &&
                          existingRecord.workStyle === 'remote'
                            ? 'primary'
                            : undefined,
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
                          text: leaveCheck % 2 === 0 ? `👋 退勤` : `✅ 退勤済`,
                          emoji: true,
                        },
                        action_id: 'button_goHome',
                        style: leaveCheck % 2 === 0 ? undefined : 'danger',
                      },
                    ],
                  },
                ],
              });
              console.log('▲ goHome action end');
            } catch (error) {
              console.log(action + '時にエラーが発生しました:' + error);
            }
          }
        } else {
          // モーダルウィンドウの構築
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
      }
    } else {
      // コールバックアクション開始
      const callbackId = payload.view?.callback_id;

      if (callbackId === 'add_user_modal') {
        // モーダルから入力された値を取得
        const userId =
          payload.view.state.values.user_id_block.user_id_input.value;
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
          console.log('データが重複しています。');
          message = `*#${userId}#* さんのデータは既に存在しています。`;
        }

        console.log(message);

        // モーダルを開いた際に保存したチャンネル情報を取得
        const privateMetadata = JSON.parse(
          payload.view.private_metadata || '{}'
        );
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
      }
    }
    res.status(200).send();
  } catch (error) {
    console.error('Error handling action:', error);
    res.status(500).send('Internal Server Error');
  }
});

// サーバーを起動
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
