import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../../types';

export class CaptureScreenTool extends BaseTool {
  name = 'capture_screen';
  description = 'Capture the current screen. Requires explicit user permission. Returns visual context for multimodal analysis.';
  permissionLevel = PermissionLevel.CONFIRM;
  parameters = { type: 'object', properties: {} };

  async execute(_args: any, context: ToolContext): Promise<ToolResult> {
    if (!context.injectedData?.image) {
      return { success: false, error: 'Screen capture failed or was denied. No image data was provided by the user interface.' };
    }
    
    // We pass the raw image data via the `data` field to be normalized by the task engine.
    return { 
      success: true, 
      data: {
        _isImage: true,
        mimeType: context.injectedData.mimeType || 'image/jpeg',
        data: context.injectedData.image // base64 string
      }
    };
  }
}
