import { BaseTool, PermissionLevel, ToolContext, ToolResult } from '../../types';

export class AnalyzeImageTool extends BaseTool {
  name = 'analyze_image';
  description = 'Analyze an image explicitly provided by the user via file attachment.';
  permissionLevel = PermissionLevel.SAFE; // No dangerous side-effects locally, user explicitly provided the image.
  parameters = { 
    type: 'object', 
    properties: {
      instruction: { type: 'string', description: 'What to look for in the image.' }
    },
    required: ['instruction']
  };

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    if (!context.injectedData?.image) {
      return { success: false, error: 'No user image is currently attached to the context.' };
    }
    
    return { 
      success: true, 
      data: {
        _isImage: true,
        mimeType: context.injectedData.mimeType || 'image/jpeg',
        data: context.injectedData.image, // base64 string
        instruction: args.instruction
      }
    };
  }
}
