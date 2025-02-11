import React, { useState, useEffect } from 'react';
import { Upload, Video, AudioLines, Loader2, AlertCircle } from 'lucide-react';

// interface UploadState {
//   video: File | null;
//   audio: File | null;
// }

interface TaskResponse {
  code: number;
  message: string;
  data: {
    taskId: string;
  };
}

interface PollResponse {
  code: number;
  message: string;
  data: {
    task: {
      taskId: string;
      status: number;
      reason?: string;
      executionTime?: number;
      expire?: number;
      taskType: string;
    };
    videos?: Array<{
      videoUrl: string;
      videoType: string;
    }>;
  };
}

// 使用演示视频和音频进行测试
// const DEMO_VIDEO_URL = "https://newportai-api-market.s3.amazonaws.com/demo_audio/video_demo.mp4";
// const DEMO_AUDIO_URL = "https://newportai-api-market.s3.amazonaws.com/demo_audio/audio_demo.mp3";

const API_KEY = '766d6dbf541f4f3abd05b7fcf0524d58';
const API_BASE_URL = 'https://api.newportai.com/api';

const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB

function App() {
  const [files, setFiles] = useState({ video: null, audio: null });
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [previews, setPreviews] = useState({ video: null, audio: null });
  // const [isDemo, setIsDemo] = useState(false);

  const validateFile = (file: File, type: 'video' | 'audio'): string | null => {
    const maxSize = type === 'video' ? MAX_VIDEO_SIZE : MAX_AUDIO_SIZE;
    if (file.size > maxSize) {
      return `${type === 'video' ? '视频' : '音频'}文件大小不能超过 ${maxSize / 1024 / 1024}MB`;
    }
    return null;
  };

  const startTalkingFaceTask = async (videoUrl: string, audioUrl: string) => {
    try {
      console.log('Starting task with:', { videoUrl, audioUrl });
      
      const response = await fetch(`${API_BASE_URL}/async/talking_face`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          srcVideoUrl: videoUrl,
          audioUrl: audioUrl,
          videoParams: {
            video_width: 0,
            video_height: 0,
            video_enhance: 1
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: TaskResponse = await response.json();
      console.log('Task response:', data);
      
      if (data.code === 0) {
        return data.data.taskId;
      } else {
        throw new Error(data.message || '处理请求失败');
      }
    } catch (err) {
      console.error('Task error:', err);
      throw new Error('开始处理失败: ' + err.message);
    }
  };

  const pollTaskStatus = async (taskId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/getAsyncResult`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ taskId })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: PollResponse = await response.json();
      console.log('Poll response full data:', JSON.stringify(data, null, 2));
      return data;
    } catch (err) {
      console.error('Poll error:', err);
      throw new Error('检查任务状态失败: ' + err.message);
    }
  };

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const checkStatus = async () => {
      if (!taskId) return;

      try {
        const result = await pollTaskStatus(taskId);
        
        if (result.code === 0) {
          console.log('Task status:', result.data.task.status);
          console.log('Task full data:', JSON.stringify(result.data, null, 2));
          
          if (result.data.task.status === 3) { // 完成
            const videoUrl = result.data.videos?.[0]?.videoUrl.trim();
            console.log('Task completed, result URL:', videoUrl);
            
            if (!videoUrl) {
              throw new Error('未获取到视频URL');
            }
            
            setIsProcessing(false);
            setResult(videoUrl);
            setTaskId(null);
            setProgress(100);
          } else if (result.data.task.status === 4) { // 失败
            const reason = result.data.task.reason || '处理失败';
            throw new Error(reason);
          } else if (result.data.task.status === 2) { // 处理中
            console.log('Task in progress');
            setProgress((prev) => Math.min(prev + 10, 90));
          } else {
            console.log('Unknown task status:', result.data.task.status);
          }
        } else {
          throw new Error(result.message || '获取任务状态失败');
        }
      } catch (err) {
        console.error('Check status error:', err);
        setError(err.message);
        setIsProcessing(false);
        setTaskId(null);
      }
    };

    if (taskId) {
      pollInterval = setInterval(checkStatus, 5000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [taskId]);

  const handleFileChange = (type: 'video' | 'audio') => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validationError = validateFile(file, type);
      
      if (validationError) {
        setError(validationError);
        return;
      }

      setFiles(prev => ({ ...prev, [type]: file }));
      setPreviews(prev => ({
        ...prev,
        [type]: URL.createObjectURL(file)
      }));
      setError(null);
      // setIsDemo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      const videoUrl = files.video ? URL.createObjectURL(files.video) : null;
      const audioUrl = files.audio ? URL.createObjectURL(files.audio) : null;

      if (!videoUrl || !audioUrl) {
        throw new Error('请上传视频和音频文件');
      }

      console.log('Starting task with uploaded files');
      setProgress(20);

      // 开始唇形同步任务
      const newTaskId = await startTalkingFaceTask(videoUrl, audioUrl);
      console.log('Task started:', newTaskId);
      setTaskId(newTaskId);
      setProgress(30);

      console.log('Sending request with:', {
        videoUrl,
        audioUrl,
        apiKey: API_KEY, // 注意：不要在生产环境中打印敏感信息
      });
    } catch (err) {
      console.error('Submit error:', err);
      setError(err.message);
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-100">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              AI 唇形同步生成器
            </h1>
            <p className="text-lg text-gray-600">
              上传您自己的视频和音频文件以生成唇形同步视频。
            </p>
            <p className="mt-2 text-sm text-gray-500">
              请上传您自己的视频和音频文件进行测试
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
              <AlertCircle className="text-red-500 mr-2" />
              <p className="text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid md:grid-cols-2 gap-6">
              {/* 视频上传区域 */}
              <div className="relative">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-indigo-500 transition-colors">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange('video')}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isProcessing}
                  />
                  <div className="text-center">
                    {previews.video ? (
                      <video
                        src={previews.video}
                        className="w-full h-48 object-cover rounded-lg mb-4"
                        controls
                      />
                    ) : (
                      <Video className="mx-auto h-12 w-12 text-gray-400" />
                    )}
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-indigo-600">
                        {files.video ? files.video.name : '选择视频'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        MP4, MOV 文件不超过 50MB
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 音频上传区域 */}
              <div className="relative">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-indigo-500 transition-colors">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileChange('audio')}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isProcessing}
                  />
                  <div className="text-center">
                    {previews.audio ? (
                      <audio
                        src={previews.audio}
                        className="w-full mb-4"
                        controls
                      />
                    ) : (
                      <AudioLines className="mx-auto h-12 w-12 text-gray-400" />
                    )}
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-indigo-600">
                        {files.audio ? files.audio.name : '选择音频'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        MP3, WAV 文件不超过 10MB
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {isProcessing && (
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            )}

            <div className="text-center">
              <button
                type="submit"
                className="button"
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                    处理中...
                  </>
                ) : (
                  <>
                    <Upload className="-ml-1 mr-3 h-5 w-5" />
                    生成
                  </>
                )}
              </button>
            </div>
          </form>

          {result && (
            <div className="mt-8 p-6 bg-white rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">处理结果</h2>
              <video
                src={result}
                controls
                className="w-full rounded-lg"
                poster="https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=2069&ixlib=rb-4.0.3"
              />
              <a
                href={result}
                download
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
              >
                下载视频
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;