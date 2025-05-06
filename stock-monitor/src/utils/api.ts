// 添加重试机制的工具函数
const retryFetch = async (url: string, options: RequestInit = {}, retries = 3, delay = 1000): Promise<Response> => {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
  } catch (error: unknown) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      console.log(`重试请求 ${url}，剩余重试次数: ${retries - 1}`);
      return retryFetch(url, options, retries - 1, delay);
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`API 请求失败: ${errorMessage}`);
  }
};

// 检查后端服务状态
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const response = await retryFetch('http://localhost:3000/health');
    return response.ok;
  } catch (error) {
    console.error('后端服务检查失败:', error);
    return false;
  }
};