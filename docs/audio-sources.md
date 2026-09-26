# 音频素材

所有以下第三方音频选择 CC0 1.0 授权，随游戏本地托管，不依赖外站播放。
授权说明：https://creativecommons.org/publicdomain/zero/1.0/

| 游戏文件 | 来源与作者 | 处理 |
| --- | --- | --- |
| public/audio/heavy-battle.mp3 | [Heavy Battle 2](https://opengameart.org/content/heavy-battle-2)，MintoDog | 原曲 heavy_battle_2_bpm185.mp3；185 BPM、约 83 秒；响度归一化至 -18 LUFS 目标，160 kbps MP3。 |
| public/audio/rifle.wav | [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library)，Ben Jaszczak、Brian Nelson、Kevin Heras、Matthew Nanney | AR-15 / D_32P.wav，约 0.702 秒处截取 0.48 秒。 |
| public/audio/gatling.wav | 同上 | AK-47 / C_28P.wav，约 0.609 秒处截取 0.28 秒；用于游戏机枪逐发采样，并非实际加特林录音。 |
| public/audio/shotgun.wav | 同上 | Charles Daly / H_21P.wav，约 0.462 秒处截取 0.68 秒。 |
| public/audio/bolt.wav | [Gun reload sounds](https://opengameart.org/content/gun-reload-sounds)，SpringySpringo | shotguncock_0.wav，airsoft 枪械机械录音；裁去起始静音。 |

枪声统一为 44.1 kHz、单声道、16-bit PCM WAV，做 65 Hz 高通、14 kHz 低通、淡入淡出与峰值归一化。运行时轻微改变单发音高和声像，霰弹叠加低频冲击与机械尾声。

配乐始终使用同一首曲目的连续时间线；战况改变滤波和音量，不靠变速改变音高。开火时短暂压低音乐，整体经过动态压缩器。冲击波、命中和提示音由本项目 Web Audio 合成。
