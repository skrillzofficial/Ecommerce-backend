const { cloudinary, uploadUserPhoto, uploadBanner } = require('../config/cloudinary');

class BannerService {
  /**
   * Upload user photo to Cloudinary
   */
  static async uploadUserPhoto(photoBuffer, userId, eventId) {
    try {
      const result = await uploadUserPhoto(photoBuffer, userId, `event-${eventId}-user`);
      
      return {
        url: result.secure_url,
        publicId: result.public_id,
        version: result.version
      };
    } catch (error) {
      console.error('Error in uploadUserPhoto:', error);
      throw new Error('Failed to upload user photo');
    }
  }

  /**
   * Generate shareable banner for ticket using Cloudinary's text overlays
   */
  static async generateShareableBanner(ticket, userPhotoBuffer = null) {
    try {
      // Create banner using Cloudinary's dynamic URL generation with text
      const bannerText = [
        `text:Arial_48_bold:${encodeURIComponent(ticket.eventName?.substring(0, 40) || 'Event Ticket')}`,
        `text:Arial_28:${encodeURIComponent(`Ticket for ${ticket.userName}`)}`,
        `text:Arial_20:${encodeURIComponent(`${ticket.ticketType} • ${new Date(ticket.eventDate).toLocaleDateString()}`)}`
      ].join('/');

      const bannerUrl = `https://via.placeholder.com/1200x630/667eea/ffffff.png`;

      // Upload the generated banner to Cloudinary
      const result = await cloudinary.uploader.upload(bannerUrl, {
        folder: `eventry/banners/${ticket.userId}`,
        public_id: `banner-${ticket._id}-${Date.now()}`,
        transformation: [
          {
            width: 1200,
            height: 630,
            crop: 'fill',
            background: 'linear_gradient:45deg,#667eea_30%,#764ba2_70%)'
          }
        ]
      });

      // If user photo is provided, create a composite image
      if (userPhotoBuffer) {
        try {
          const userPhotoResult = await this.uploadUserPhoto(userPhotoBuffer, ticket.userId, ticket.eventId);
          
          // Create a new composite image with user photo
          const compositeResult = await cloudinary.uploader.upload(result.secure_url, {
            folder: `eventry/banners/${ticket.userId}`,
            public_id: `banner-with-photo-${ticket._id}-${Date.now()}`,
            transformation: [
              {
                width: 1200,
                height: 630,
                crop: 'fill',
                background: 'linear_gradient:45deg,#667eea_30%,#764ba2_70%)'
              },
              {
                overlay: userPhotoResult.publicId,
                width: 120,
                height: 120,
                gravity: 'north_east',
                x: 30,
                y: 30,
                radius: 60,
                crop: 'fill'
              }
            ]
          });

          // Delete the original banner without photo
          await cloudinary.uploader.destroy(result.public_id);
          
          return {
            url: compositeResult.secure_url,
            publicId: compositeResult.public_id,
            designSnapshot: {
              eventName: ticket.eventName,
              userName: ticket.userName,
              ticketType: ticket.ticketType,
              eventDate: ticket.eventDate,
              hasUserPhoto: true,
              generatedAt: new Date().toISOString()
            }
          };
        } catch (photoError) {
          console.warn('Failed to add user photo to banner, using text-only version:', photoError);
          // Continue with text-only banner
        }
      }

      return {
        url: result.secure_url,
        publicId: result.public_id,
        designSnapshot: {
          eventName: ticket.eventName,
          userName: ticket.userName,
          ticketType: ticket.ticketType,
          eventDate: ticket.eventDate,
          hasUserPhoto: false,
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Error in generateShareableBanner:', error);
      // Fallback to simple placeholder
      return await this.generateSimpleBanner(ticket);
    }
  }

  /**
   * Simple banner generation as fallback
   */
  static async generateSimpleBanner(ticket) {
    try {
      // Create a simple gradient background with text
      const bannerUrl = `https://via.placeholder.com/1200x630/667eea/ffffff.png?text=${encodeURIComponent(ticket.eventName || 'Event Ticket')}`;
      
      const result = await cloudinary.uploader.upload(bannerUrl, {
        folder: `eventry/banners/${ticket.userId}`,
        public_id: `simple-banner-${ticket._id}-${Date.now()}`,
        transformation: [
          {
            width: 1200,
            height: 630,
            crop: 'fill',
            background: 'linear_gradient:45deg,#667eea_30%,#764ba2_70%)'
          }
        ]
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        designSnapshot: {
          eventName: ticket.eventName,
          userName: ticket.userName,
          generatedAt: new Date().toISOString(),
          type: 'simple'
        }
      };
    } catch (error) {
      console.error('Error in generateSimpleBanner:', error);
      // Ultimate fallback - direct placeholder URL
      return {
        url: `https://via.placeholder.com/1200x630/667eea/ffffff.png?text=${encodeURIComponent(ticket.eventName?.substring(0, 30) || 'Event Ticket')}`,
        publicId: `fallback-banner-${ticket._id}`,
        designSnapshot: {
          eventName: ticket.eventName,
          userName: ticket.userName,
          generatedAt: new Date().toISOString(),
          type: 'fallback'
        }
      };
    }
  }

  /**
   * Delete banner from Cloudinary
   */
  static async deleteBanner(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result;
    } catch (error) {
      console.error('Error deleting banner:', error);
      throw new Error('Failed to delete banner');
    }
  }
}

module.exports = BannerService;